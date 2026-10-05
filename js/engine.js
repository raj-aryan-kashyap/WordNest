/**
 * Word engine: decides which word to show next and learns from answers.
 *
 * How the picking works
 * 1. Every candidate word has a difficulty d (1 easy to 5 hard) and topics.
 * 2. We keep one number for the learner, "skill", on the same scale.
 *    Each "I know this" / "New to me" nudges skill up or down, like a
 *    simple Elo rating: surprising answers move it more.
 * 3. We aim a little above skill (so most words feel new but reachable),
 *    and lower the aim if recent quiz answers are often wrong.
 * 4. Topics get weights: topics the user keeps knowing go down, topics
 *    full of new words go up. Words that match one of the user's goals get
 *    a boost, and words outside all goals get a penalty.
 * 4b. With several goals, the goal that got the fewest recent new words
 *    gets an extra boost, so the mix stays balanced and a newly added goal
 *    shows up within a few cards.
 * 5. Candidates come from the starter pack, then from free online sources
 *    (Datamuse + dictionary + Hindi), or from Gemini if a key is added.
 */
import { SEED } from './data/seed.js';
import { CONFIG } from './config.js';
import { dayKey, clamp, hash01, slug } from './utils.js';
import { newRecord, knownRecord } from './srs.js';
import { activeGoals, PRESETS } from './goals.js';
import { status } from './status.js';
import { wordPattern } from './quiz.js';
import { datamuseRelated, lookupDictionary, translateToHindi, geminiJSON, claudeJSON } from './sources.js';

export const LEVEL_START = { beginner: 1.6, middle: 2.6, advanced: 3.6 };

export const TOPIC_LABEL = {
  cs: 'Customer care', corp: 'Office', tech: 'Tech', ai: 'AI',
  comm: 'Speaking and writing', career: 'Interviews', exam: 'Exams', hr: 'Workplace and HR',
  ctx: 'For you', general: 'Everyday', mine: 'Added by you',
};

/** Label for a word's topic pill. User-written goal tags show as "For you". */
export const topicLabel = (t) => TOPIC_LABEL[t] || (t.startsWith('c:') ? 'For you' : null);

/** Topics that are always part of the mix, whatever goals the user picks. */
export const CORE_TAGS = new Set(['hr']);

const actionCount = (history) => history.filter((h) => h.k === 'n' || h.k === 'k').length;

/**
 * Keep only AI words that are new, complete and really used in their examples.
 * Same rules as cleanAiWords() in the Apps Script.
 */
export function cleanAiWords(list, { avoid = [], goalTags = {} } = {}) {
  const skip = new Set(avoid.map((w) => String(w).toLowerCase()));
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    const w = String(x.word || '').trim();
    const k = w.toLowerCase();
    if (!w || w.length > 40 || /\d/.test(w) || skip.has(k)) continue;
    const m = String(x.meaning || '').trim();
    if (!m || m.split(/\s+/).length > 25) continue;
    const re = wordPattern(w);
    const ex = [['Past', x.past], ['Present', x.present], ['Future', x.future]]
      .map(([t, v]) => ({ t, s: String(v || '').trim() })).filter((e) => e.s);
    if (ex.filter((e) => re.test(e.s)).length < 2) continue;        // examples must use the word
    const hi = /[\u0900-\u097F]/.test(String(x.hindi || '')) ? String(x.hindi).trim() : '';
    const ids = (Array.isArray(x.goals) ? x.goals : Array.isArray(x.tags) ? x.tags : []).map(String);
    const tags = [...new Set(ids.flatMap((id) => goalTags[id] || [id]))].filter((t) => TOPIC_LABEL[t] || t.startsWith('c:'));
    skip.add(k);
    out.push({
      id: 'a:' + slug(w), w, p: String(x.pos || ''), ipa: String(x.ipa || ''), say: String(x.say || ''),
      m, note: String(x.note || '').trim(), ex, hi, him: hi ? String(x.hindiMeaning || '').trim() : '',
      d: clamp(Number(x.level) || 3, 1, 5), t: tags.length ? tags : ['general'], src: 'ai',
    });
  }
  return out;
}

export class Engine {
  constructor(store) {
    this.store = store;
    this.seedMap = new Map(SEED.map((c) => [c.id, c]));
    this.seedWords = new Set(SEED.map((c) => c.w.toLowerCase()));
    this.inflight = new Map();
    this.refillPromise = null;
    this.lastAction = null;
    this.sessionSeed = String(Math.random());
    this.lastRefillAdded = null;
    this.serverSuggest = null;   // set by app.js when sync is on: (request) => Promise<response>
    this.nextRefillAt = 0;       // client-side backoff so we never hammer free services
    this.serverAiOff = false;    // the sheet has no Gemini key: skip it this session
  }

  /* ---------- Card lookup ---------- */

  card(id) {
    return this.seedMap.get(id) || this.store.cards[id] || null;
  }

  /** Every card we have full content for (used for quiz options). */
  allCards() {
    return [...SEED, ...Object.values(this.store.cards)];
  }

  seenWords() {
    const s = new Set();
    for (const r of Object.values(this.store.state.words)) s.add(String(r.w).toLowerCase());
    return s;
  }

  /* ---------- Learner model ---------- */

  skill() {
    const m = this.store.state.model;
    return m.skill ?? LEVEL_START[this.store.state.profile.level] ?? 2.6;
  }

  /** Share of wrong answers in the last 20 quiz answers. */
  recentWrongRate() {
    const quiz = this.store.state.history.filter((h) => h.k === 'r0' || h.k === 'r1').slice(-20);
    if (quiz.length < 5) return 0.2;
    return quiz.filter((h) => h.k === 'r0').length / quiz.length;
  }

  targetDifficulty() {
    const t = this.skill() + 0.5 - 0.8 * (this.recentWrongRate() - 0.2);
    return clamp(t, 1, 5.5);
  }

  /* ---------- Ranking ---------- */

  candidates() {
    const seen = this.seenWords();
    const out = [];
    for (const c of SEED) {
      if (!seen.has(c.w.toLowerCase())) out.push({ id: c.id, w: c.w, d: c.d, t: c.t, src: 'seed' });
    }
    for (const p of this.store.pool) {
      const w = p.w.toLowerCase();
      if (!p.bad && !seen.has(w) && !this.seedWords.has(w)) out.push(p);
    }
    return out;
  }

  isReady(c) {
    return c.src === 'seed' || !!this.store.cards[c.id];
  }

  ranked() {
    const target = this.targetDifficulty();
    const tagW = this.store.state.model.tagW || {};
    const goals = activeGoals(this.store.state.profile);
    const goalSet = new Set(goals.flatMap((g) => g.tags));
    const balance = this.goalBalance(goals);
    const scored = this.candidates().map((c) => {
      const tags = c.t || [];
      const fit = -Math.abs(c.d - target);
      const topic = tags.length ? tags.reduce((a, t) => a + (tagW[t] || 0), 0) / tags.length : 0;
      const inGoal = tags.some((t) => goalSet.has(t) || CORE_TAGS.has(t));
      const ctx = !goals.length ? 0 : inGoal ? 0.6 : -0.5;
      const mix = tags.reduce((m, t) => Math.max(m, balance.get(t) || 0), 0);
      const ready = this.isReady(c) ? 0.25 : 0;
      const jitter = hash01(c.id + this.sessionSeed) * 0.35; // stable variety within a session
      return { c, score: fit + topic * 0.6 + ctx + mix + ready + jitter };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.c);
  }

  /**
   * Extra boost per tag for goals that got few of the last 40 new words.
   * One goal: no boost. A brand new goal (0 recent words) gets the most.
   */
  goalBalance(goals) {
    const map = new Map();
    if (goals.length < 2) return map;
    const recent = this.store.state.history.filter((h) => h.k === 'n').slice(-40)
      .map((h) => this.card(h.id)?.t || []);
    const total = recent.length || 1;
    for (const g of goals) {
      const hits = recent.filter((tags) => tags.some((t) => g.tags.includes(t))).length;
      const bonus = clamp((1 / goals.length - hits / total) * 1.5, 0, 0.6);
      for (const t of g.tags) map.set(t, Math.max(map.get(t) || 0, bonus));
    }
    return map;
  }

  /** Search keywords, one goal at a time, neediest goal first. */
  searchKeywords() {
    const goals = activeGoals(this.store.state.profile);
    if (!goals.length) return PRESETS.find((p) => p.id === 'general').kw.map((kw) => ({ kw, tag: 'general' }));
    const balance = this.goalBalance(goals);
    const lists = goals
      .map((g) => ({ g, need: balance.get(g.tags[0]) || 0 }))
      .sort((a, b) => b.need - a.need)
      .map((x) => x.g.keywords.length ? x.g.keywords : [{ kw: x.g.label.split(/\s+/).slice(0, 3).join(' '), tag: x.g.tags[0] }]);
    const out = [];
    for (let i = 0; out.length < 40 && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i]) out.push(l[i]);
    return out;
  }

  /** Ready words that fit the learner: in a goal (or core), near the target level. */
  readyGoodCount() {
    const target = this.targetDifficulty();
    const goalSet = new Set(activeGoals(this.store.state.profile).flatMap((g) => g.tags));
    return this.candidates().filter((c) => this.isReady(c)
      && Math.abs(c.d - target) <= 1.0
      && (c.t || []).some((t) => goalSet.has(t) || CORE_TAGS.has(t))).length;
  }

  /** Top up only when the good-fit queue runs low. Keeps free limits safe. */
  maybeRefill() {
    const ready = this.readyGoodCount();
    status.set('words', { ready });
    if (ready < 10 && Date.now() >= this.nextRefillAt) this.refill().catch(() => {});
  }

  /**
   * Next word card to show. Returns null when there is nothing left.
   * Throws only when we need the internet and it is not available.
   */
  async next() {
    let networkError = null;
    for (let tries = 0; tries < 8; tries++) {
      let list = this.ranked();
      this.maybeRefill();                                       // top up in the background if needed
      if (!list.length) {
        try { await this.refill(); } catch (e) { networkError = e; }
        list = this.ranked();
        if (!list.length) {
          if (networkError) throw networkError;
          return null;
        }
      }
      const top = list[0];
      if (this.isReady(top)) return this.card(top.id);
      try {
        const card = await this.ensureCard(top);
        if (card) return card;                                   // else: marked bad, loop again
      } catch (e) {
        // Offline or source down: fall back to any word that is already ready.
        networkError = e;
        const ready = list.find((c) => this.isReady(c));
        if (ready) return this.card(ready.id);
        throw e;
      }
    }
    if (networkError) throw networkError;
    return null;
  }

  /** Fetch the next couple of online words early so the next card is instant. */
  prefetch() {
    const todo = this.ranked().filter((c) => !this.isReady(c)).slice(0, 2);
    (async () => {
      for (const c of todo) {
        try { await this.ensureCard(c); } catch { return; }
      }
    })();
  }

  /** Build a full card for an online candidate. Returns null if the word is not usable. */
  ensureCard(c) {
    if (this.store.cards[c.id]) return Promise.resolve(this.store.cards[c.id]);
    if (this.inflight.has(c.id)) return this.inflight.get(c.id);
    const job = (async () => {
      const dict = await lookupDictionary(c.w);
      if (!dict) {
        this.markBad(c.id);
        return null;
      }
      const [hi, him] = await Promise.all([translateToHindi(c.w), translateToHindi(dict.meaning)]);
      const card = {
        id: c.id, w: c.w, p: dict.pos || c.p || '', ipa: dict.ipa, say: '',
        m: dict.meaning, ex: dict.examples.map((s) => ({ t: 'Example', s })),
        hi, him: him && him !== hi ? him : '', d: c.d, t: c.t || [], audio: dict.audio, src: c.src,
      };
      this.store.cards[c.id] = card;
      this.store.touchCards();
      return card;
    })().finally(() => this.inflight.delete(c.id));
    this.inflight.set(c.id, job);
    return job;
  }

  markBad(id) {
    const pool = this.store.pool.map((p) => (p.id === id ? { ...p, bad: true } : p));
    this.store.setPool(pool);
  }

  /* ---------- Refill from online sources ---------- */

  /**
   * Find more words. Order: Claude (preview) > Gemini via the sheet >
   * Gemini key on this phone > free dictionary. `force` skips the backoff.
   */
  refill({ force = false } = {}) {
    if (this.refillPromise) return this.refillPromise;
    if (!force && Date.now() < this.nextRefillAt) return Promise.resolve(0);
    status.set('words', { phase: 'running', error: '' });
    this.refillPromise = (async () => {
      let added = 0;
      let source = '';
      try {
        if (CONFIG.PREVIEW) {
          added = await this.refillFromAI(claudeJSON);
          source = 'claude';
        } else {
          if (this.serverSuggest && !this.serverAiOff) {
            added = await this.refillFromServer();
            if (added > 0) source = 'server';
          }
          const ai = this.store.ai;
          if (!added && ai.key) {
            try {
              const model = ai.model || CONFIG.DEFAULT_AI_MODEL;
              added = await this.refillFromAI((prompt) => geminiJSON({ key: ai.key, model, prompt }));
              if (added > 0) source = 'phone';
            } catch (e) {
              console.warn('Phone Gemini failed, using free sources', e);
            }
          }
          if (!added) {
            added = await this.refillFromDatamuse();
            source = 'datamuse';
          }
        }
        // Back off a little after every refill, more when nothing new came back.
        this.nextRefillAt = Date.now() + (added ? 30000 : 120000);
        status.set('words', { phase: 'idle', lastAdded: added, lastSource: source, lastAt: Date.now(), ready: this.readyGoodCount() });
        return added;
      } catch (e) {
        this.nextRefillAt = Date.now() + 120000;
        status.set('words', { phase: 'error', error: navigator.onLine === false ? "You're offline." : "Couldn't find new words just now." });
        throw e;
      }
    })().finally(() => { this.refillPromise = null; });
    return this.refillPromise;
  }

  /* ---------- Smart picks: what we tell the AI about this learner ---------- */

  /** Builds the prompt and avoid list from goals, level and answers. Shared by every AI source. */
  buildAiRequest(count = 12) {
    const st = this.store.state;
    const goals = activeGoals(st.profile);
    const balance = this.goalBalance(goals);
    const words = Object.values(st.words);
    const byTime = (a, b) => (b.u || 0) - (a.u || 0);
    const known = words.filter((r) => r.s === 'known').sort(byTime).slice(0, 40).map((r) => r.w);
    const fresh = words.filter((r) => r.s !== 'known').sort(byTime).slice(0, 30).map((r) => r.w);
    const hard = words.filter((r) => r.bad > 0 && r.bad >= r.ok).sort((a, b) => b.bad - a.bad).slice(0, 15).map((r) => r.w);
    const easy = words.filter((r) => r.ok >= 3 && r.bad === 0).slice(0, 15).map((r) => r.w);
    const tagW = st.model.tagW || {};
    const label = (t) => topicLabel(t);
    const strong = Object.entries(tagW).filter(([, v]) => v <= -0.3).map(([t]) => label(t)).filter(Boolean);
    const growing = Object.entries(tagW).filter(([, v]) => v >= 0.25).map(([t]) => label(t)).filter(Boolean);
    const avoid = [...new Set([...this.seenWords(), ...this.seedWords, ...this.store.pool.map((p) => p.w.toLowerCase())])];
    const target = this.targetDifficulty();
    const goalLines = goals.length
      ? goals.map((g) => `- id "${g.id}": ${g.about}${(balance.get(g.tags[0]) || 0) > 0.2 ? ' (needs more words right now)' : ''}`).join('\n')
      : '- id "general": everyday English';
    const line = (title, list) => (list.length ? `- ${title}: ${list.join(', ')}\n` : '');

    const prompt = `You choose English vocabulary for one learner in a learning app.

GOALS (mix the words across these goals; tag each word with the ids it serves):
${goalLines}
- id "hr": working at a company: meetings, contracts, pay, leave and HR (always useful)

LEARNER
- Level about ${this.skill().toFixed(1)} on a 1 to 5 scale (1 very basic, 5 advanced professional).
- Recent quiz mistakes: ${Math.round(this.recentWrongRate() * 100)}%.
- Aim most words at level ${target.toFixed(1)}. Include 2 slightly easier and 2 slightly harder.
${line('Already knows these (too easy; never go below this level)', known)}${line('Recently marked new (good level match)', fresh)}${line('Finds these hard (suggest simpler supporting words, not harder ones)', hard)}${line('Remembers these easily', easy)}${line('Strong topics (fewer basics needed)', strong)}${line('Topics with many new words for them (more useful here)', growing)}
RULES
- Real English that this person will actually hear, say or write in these goals: calls, chats, emails, meetings, everyday work. Prefer words and short phrases over rare or literary words.
- "meaning": very simple English, at most 15 words, without using the word itself.
- "present", "past", "future": short natural sentences (at most 12 words) from their real work situations. Each one must contain the word.
- "note": when or where they would use it, at most 10 words.
- "say": an easy respelling with the stressed part in capitals, like "ES-kuh-layt".
- "ipa": the British IPA in slashes.
- "hindi": the Hindi word or phrase in Devanagari. "hindiMeaning": a short Hindi explanation.
- "level": 1 to 5. "goals": ids from the list above.
- Do not use dashes as punctuation.
- Never suggest any of these words, they were already shown: ${avoid.slice(-700).join(', ') || 'none'}

Return JSON only: {"words":[{"word":"","pos":"","ipa":"","say":"","meaning":"","note":"","present":"","past":"","future":"","hindi":"","hindiMeaning":"","level":3,"goals":[""]}]} with exactly ${count} words.`;

    const goalTags = { hr: ['hr'] };
    const contextNames = { hr: TOPIC_LABEL.hr };
    for (const g of goals) { goalTags[g.id] = g.tags; contextNames[g.id] = g.label; }
    return { prompt, avoid, goalTags, contextNames, count };
  }

  /** Gemini via the Google Sheet (the key never touches the phone). */
  async refillFromServer() {
    const { prompt, avoid, goalTags, contextNames } = this.buildAiRequest();
    let res;
    try {
      res = await this.serverSuggest({ prompt, avoid, goalTags, contextNames });
    } catch (e) {
      // Network or sign-in problem: fall back quietly.
      status.set('words', { error: e.message });
      return 0;
    }
    if (res.ai) status.set('words', { ai: res.ai });
    if (!res.ok) {
      if (res.code === 'no_key') this.serverAiOff = true;
      if (res.code === 'ai_busy' || res.code === 'ai_wait') {
        status.set('words', { aiPausedUntil: Date.now() + (res.retryIn || 60) * 1000 });
      }
      return 0;
    }
    const cards = (res.cards || []).map((c) => ({
      id: c.id, w: c.w, p: c.p, ipa: c.ipa, say: c.say, m: c.m, note: c.note,
      ex: [['Past', c.past], ['Present', c.present], ['Future', c.future]].filter(([, x]) => x).map(([t, x]) => ({ t, s: x })),
      hi: c.hi, him: c.him, d: c.d, t: c.t, src: 'ai',
    }));
    return this.addAiCards(cards, { sentToLibrary: true });
  }

  /** Add AI cards to the queue (they are complete, so ready right away). */
  addAiCards(cards, { sentToLibrary = false } = {}) {
    const seen = this.seenWords();
    const items = [];
    for (const c of cards) {
      const w = c.w.toLowerCase();
      if (seen.has(w) || this.seedWords.has(w)) continue;
      this.store.cards[c.id] = c;
      items.push({ id: c.id, w: c.w, d: c.d, t: c.t, src: 'ai' });
    }
    this.store.touchCards();
    if (sentToLibrary && this.onSentToLibrary) this.onSentToLibrary(items.map((i) => i.id));
    return this.addToPool(items);
  }

  addToPool(items) {
    const seen = this.seenWords();
    const have = new Set(this.store.pool.map((p) => p.w.toLowerCase()));
    const fresh = items.filter((it) => {
      const w = it.w.toLowerCase();
      if (seen.has(w) || have.has(w) || this.seedWords.has(w)) return false;
      have.add(w);
      return true;
    });
    // Keep the pool small: drop bad and already-seen entries first.
    let pool = this.store.pool.filter((p) => !p.bad && !seen.has(p.w.toLowerCase()));
    pool = pool.concat(fresh).slice(-400);
    this.store.setPool(pool);
    this.lastRefillAdded = fresh.length;
    return fresh.length;
  }

  async refillFromDatamuse() {
    const keywords = this.searchKeywords();
    const rot = this.store.state.model.rot || 0;
    const picks = [0, 1, 2].map((i) => keywords[(rot + i) % keywords.length]);
    this.store.update((s) => { s.model.rot = rot + 3; }, { sync: false });

    const results = await Promise.allSettled(picks.map((k) => datamuseRelated(k.kw)));
    const items = [];
    let anyOk = false;
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      anyOk = true;
      for (const it of r.value) {
        items.push({ id: 'd:' + slug(it.w), w: it.w, d: it.d, p: it.p, def: it.def, t: [picks[i].tag], src: 'datamuse' });
      }
    });
    if (!anyOk) throw results.find((r) => r.status === 'rejected')?.reason || new Error('Offline');
    return this.addToPool(items);
  }

  /** `generate(prompt)` returns parsed JSON, or null if the AI is not reachable. */
  async refillFromAI(generate) {
    const req = this.buildAiRequest();
    const out = await generate(req.prompt);
    if (!out) return 0;
    return this.addAiCards(cleanAiWords(out.words, req));
  }

  /** Words sent down from the sheet's Library join the queue, ready to show. */
  addLibraryCards(cards) {
    const seen = this.seenWords();
    const items = [];
    for (const c of cards) {
      const w = c.w.toLowerCase();
      if (seen.has(w) || this.seedWords.has(w)) continue;
      if (!this.store.cards[c.id]) this.store.cards[c.id] = c;
      items.push({ id: c.id, w: c.w, d: c.d, t: c.t, src: 'library' });
    }
    this.store.touchCards();
    const added = this.addToPool(items);
    if (added) status.set('words', { lastAdded: added, lastSource: 'library', lastAt: Date.now(), ready: this.readyGoodCount() });
    return added;
  }

  /* ---------- Learning actions ---------- */

  /** Save "I know this" (known = true) or "New to me" (known = false). */
  record(card, known) {
    const today = dayKey();
    const st = this.store.state;
    const prevRec = st.words[card.id] ? { ...st.words[card.id] } : null;
    const prevModel = JSON.parse(JSON.stringify(st.model));

    this.store.update((s) => {
      s.words[card.id] = known ? knownRecord(card, today) : newRecord(card, today);

      // Elo-style update of skill: surprising answers move it more.
      const m = s.model;
      if (m.skill == null) m.skill = LEVEL_START[s.profile.level] ?? 2.6;
      const p = 1 / (1 + Math.exp(-1.6 * (m.skill - card.d)));    // chance they already know it
      const actions = actionCount(s.history);
      const k = actions < 20 ? 0.35 : 0.18;                          // learn fast at first
      m.skill = clamp(m.skill + k * ((known ? 1 : 0) - p), 0.5, 5.5);
      for (const t of card.t || []) {
        m.tagW[t] = clamp((m.tagW[t] || 0) + (known ? -0.08 : 0.1), -1, 1);
      }
      m.u = Date.now();

      s.history.push({ t: Date.now(), id: card.id, k: known ? 'k' : 'n' });
      if (s.history.length > 1500) s.history = s.history.slice(-1500);
    });

    if (!this.seedMap.has(card.id) && !this.store.cards[card.id]) {
      this.store.cards[card.id] = card;
      this.store.touchCards();
    }
    this.lastAction = { card, prevRec, prevModel };
  }

  /** Undo the last Learn action. Returns the card to show again. */
  undo() {
    const a = this.lastAction;
    if (!a) return null;
    this.store.update((s) => {
      if (a.prevRec) s.words[a.card.id] = a.prevRec;
      else delete s.words[a.card.id];
      s.model = a.prevModel;
      for (let i = s.history.length - 1; i >= 0; i--) {
        if (s.history[i].id === a.card.id && (s.history[i].k === 'n' || s.history[i].k === 'k')) {
          s.history.splice(i, 1);
          break;
        }
      }
    });
    this.lastAction = null;
    return a.card;
  }

  /** Quiz answers also nudge the model a little. */
  noteQuizAnswer(card, correct) {
    this.store.update((s) => {
      s.history.push({ t: Date.now(), id: card.id, k: correct ? 'r1' : 'r0' });
      if (s.history.length > 1500) s.history = s.history.slice(-1500);
      if (!correct && s.model.skill != null) s.model.skill = clamp(s.model.skill - 0.03, 0.5, 5.5);
    });
  }

  /**
   * Goals changed. Learned words, revision, skill and topic weights stay.
   * Upcoming online words that only served removed goals are dropped,
   * and the search starts again from the neediest (often the new) goal.
   */
  applyGoalChange() {
    const tags = new Set(activeGoals(this.store.state.profile).flatMap((g) => g.tags));
    const seen = this.seenWords();
    const before = this.store.pool.length;
    const keep = [];
    for (const p of this.store.pool) {
      const fits = (p.t || []).some((t) => tags.has(t));
      if (fits || seen.has(p.w.toLowerCase())) keep.push(p);
      else if (p.src !== 'seed') delete this.store.cards[p.id]; // unseen card for a removed goal
    }
    this.store.setPool(keep);
    this.store.touchCards();
    this.store.update((s) => { s.model.rot = 0; });
    this.refill().catch(() => {}); // start finding words for new goals now
    return { dropped: before - keep.length };
  }

  /**
   * Level setting changed. Early on, restart from the new level.
   * After 20+ answers, move the estimate halfway, since answers are better evidence.
   */
  applyLevelChange(prevLevel, nextLevel) {
    this.store.update((s) => {
      const m = s.model;
      if (m.skill == null || actionCount(s.history) < 20) m.skill = null;
      else m.skill = clamp(m.skill + 0.5 * ((LEVEL_START[nextLevel] ?? 2.6) - (LEVEL_START[prevLevel] ?? 2.6)), 0.5, 5.5);
      m.u = Date.now();
    });
  }
}
