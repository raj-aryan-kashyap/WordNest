/**
 * "Add your own word": the user types a word, we fill in everything else.
 *
 * Lookup order (cheapest first, all free):
 *  1. Words the app already has (starter pack, Library words in the queue)
 *  2. The sheet: its Library, then Gemini (own daily cap)       [GitHub version]
 *     Claude                                                     [preview]
 *  3. Free Dictionary + MyMemory (Hindi) + Datamuse (level)
 *  4. Not found: spelling suggestions, or add with your own meaning
 */
import { esc, slug, haptic, dayKey } from './utils.js';
import { icon, sheet, toast, speak, openSearch } from './ui.js';
import { renderEntry } from './components.js';
import { activeGoals } from './goals.js';
import { syncConfigured, enrichFromServer } from './sync.js';
import { lookupDictionary, translateToHindi, levelForWord, spellingSuggestions, claudeJSON } from './sources.js';
import { cleanAiWords } from './engine.js';
import { newRecord } from './srs.js';
import { CONFIG } from './config.js';

const SOURCE_TEXT = {
  have: 'Details from the app’s word list',
  library: 'Details from the shared Library',
  gemini: 'Details filled in by AI',
  claude: 'Details filled in by AI',
  dictionary: 'Details from a free dictionary',
  manual: 'Your own meaning',
};

/** Tidy what the user typed. Keeps capitals for short acronyms like "KPI". */
export function cleanInput(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  return /^[A-Z]{2,6}$/.test(t) ? t : t.toLowerCase();
}

export function validateInput(t) {
  if (!t) return 'Type a word or a short phrase.';
  if (t.length > 40) return 'Keep it under 40 letters.';
  if (!/^[A-Za-z][A-Za-z' -]*$/.test(t)) return 'Use English letters only. Spaces, dashes and apostrophes are fine.';
  return '';
}

function learnerContext(store, engine) {
  const goals = activeGoals(store.state.profile).map((g) => g.about).join('; ') || 'everyday English';
  return `Learner goals: ${goals}. Learner level about ${engine.skill().toFixed(1)} of 5.`;
}

/** Finds full details for a word. Returns { status, card?, source?, suggestions? }. */
export async function lookupWord(text, { store, engine }) {
  const word = cleanInput(text);
  const k = word.toLowerCase();

  // Already in the user's words?
  const rec = Object.values(store.state.words).find((r) => r.w.toLowerCase() === k);
  if (rec) return { status: 'exists', rec, card: engine.card(rec.id) };

  // 1) Something the app already knows (starter pack or a queued card)
  const known = engine.allCards().find((c) => c.w.toLowerCase() === k);
  if (known) return { status: 'ok', source: 'have', card: { ...known } };

  // 2a) Preview: Claude fills it in
  if (CONFIG.PREVIEW) {
    try {
      const out = await claudeJSON(`Fill in one vocabulary card for "${word}". ${learnerContext(store, engine)}
Return JSON only: {"words":[{"word":"${word}","pos":"","ipa":"","say":"","meaning":"","note":"","present":"","past":"","future":"","hindi":"","hindiMeaning":"","level":3,"goals":["mine"]}]}
Rules: simple meaning (max 15 words), three short sentences that each contain the word, Hindi in Devanagari, easy respelling with stress in capitals. If it is not a real English word, return {"words":[]}.`);
      const cards = cleanAiWords((out?.words || []).filter((x) => String(x.word || '').toLowerCase() === k), { goalTags: { mine: ['mine'] } });
      if (cards[0]) return { status: 'ok', source: 'claude', card: cards[0] };
      if (out) return { status: 'notfound', word, suggestions: [] };
    } catch { /* fall through */ }
  }

  // 2b) The sheet: Library first, then Gemini
  if (syncConfigured()) {
    try {
      const res = await enrichFromServer(store, { word, context: learnerContext(store, engine) });
      if (res.ok && res.card) {
        const c = res.card;
        const ex = [['Past', c.past], ['Present', c.present], ['Future', c.future]]
          .filter(([, s]) => s).map(([t, s]) => ({ t, s: String(s) }));
        for (const s of String(c.other || '').split(' | ').filter(Boolean)) ex.push({ t: 'Example', s });
        return {
          status: 'ok', source: res.source,
          card: { id: c.id || '', w: c.w || word, p: c.p || '', ipa: c.ipa || '', say: c.say || '', m: c.m, note: c.note || '',
            ex, hi: c.hi || '', him: c.him || '', d: Number(c.d) || 3, t: ['mine'] },
        };
      }
      if (res.code === 'not_found') {
        return { status: 'notfound', word, suggestions: await spellingSuggestions(word) };
      }
    } catch { /* offline or sheet busy: try the free dictionary */ }
  }

  // 3) Free dictionary + Hindi + level
  let dict;
  try {
    dict = await lookupDictionary(word);
  } catch {
    return { status: 'offline' };
  }
  if (!dict) return { status: 'notfound', word, suggestions: await spellingSuggestions(word) };
  const [hi, him, d] = await Promise.all([translateToHindi(word), translateToHindi(dict.meaning), levelForWord(word)]);
  return {
    status: 'ok', source: 'dictionary',
    card: { id: '', w: word, p: dict.pos, ipa: dict.ipa, say: '', m: dict.meaning,
      ex: dict.examples.map((s) => ({ t: 'Example', s })), hi, him: him && him !== hi ? him : '', d, t: ['mine'], audio: dict.audio },
  };
}

/** Save a looked-up card as the user's own learning word. */
export function addOwnWord(card, { store, engine }) {
  const today = dayKey();
  const id = card.id && !card.id.startsWith('u:') && engine.card(card.id) ? card.id : 'u:' + slug(card.w);
  const full = { ...card, id, src: card.id && card.id.startsWith('s:') ? 'seed' : 'user', t: card.t?.length ? card.t : ['mine'] };
  if (full.src !== 'seed') { store.cards[id] = full; store.touchCards(); }
  store.update((s) => {
    s.words[id] = { ...newRecord(full, today), mine: true };
    s.history.push({ t: Date.now(), id, k: 'a' });
    if (s.history.length > 1500) s.history = s.history.slice(-1500);
  });
  store.markActive();
  return full;
}

/* ---------- The sheet UI ---------- */

export function openAddWord({ store, engine, onAdded }) {
  let current = null;   // { card, source }
  let editing = false;

  sheet({
    label: 'Add your own word',
    html: `<h2 class="sheet-title">Add your own word</h2>
      <p class="sheet-text">Type a word or short phrase you heard. We'll fill in the meaning, how to say it, examples and Hindi.</p>
      <div class="add-row" style="margin-top:16px">
        <label class="visually-hidden" for="aw-input">Word</label>
        <input id="aw-input" class="input" type="text" maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="true" enterkeyhint="search" placeholder="For example: liaise">
        <button class="btn btn-primary" type="button" data-aw="look" disabled>Look it up</button>
      </div>
      <p class="field-error" data-aw-error hidden></p>
      <div data-aw-result></div>`,
    onMount(el, close) {
      const input = el.querySelector('#aw-input');
      const lookBtn = el.querySelector('[data-aw="look"]');
      const errEl = el.querySelector('[data-aw-error]');
      const out = el.querySelector('[data-aw-result]');
      const setError = (m) => { errEl.textContent = m; errEl.hidden = !m; };

      input.addEventListener('input', () => { lookBtn.disabled = !input.value.trim(); setError(''); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); look(); } });
      setTimeout(() => input.focus(), 250);

      async function look(text = input.value) {
        const word = cleanInput(text);
        input.value = word;
        const problem = validateInput(word);
        if (problem) return setError(problem);
        setError('');
        editing = false;
        lookBtn.classList.add('is-busy');
        out.innerHTML = `<div class="aw-loading"><div class="sk sk-word" style="width:45%"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div>
          <p class="loading-note">Looking up “${esc(word)}”...</p></div>`;
        let res;
        try { res = await lookupWord(word, { store, engine }); }
        catch { res = { status: 'offline' }; }
        lookBtn.classList.remove('is-busy');
        show(res);
      }

      function show(res) {
        if (res.status === 'ok') {
          current = res;
          out.innerHTML = previewHtml();
        } else if (res.status === 'exists') {
          current = null;
          out.innerHTML = `<div class="aw-msg">${icon('check', 20)}<div><p class="st-title">Already in your words</p>
            <p class="st-sub">“${esc(res.rec.w)}” is in your ${res.rec.s === 'known' ? 'Known' : res.rec.s === 'mastered' ? 'Mastered' : 'Learning'} list.</p></div></div>
            ${res.card ? renderEntry(res.card, { tools: false, mine: !!res.rec.mine }) : ''}`;
        } else if (res.status === 'notfound') {
          current = null;
          out.innerHTML = `<div class="aw-msg">${icon('search', 20)}<div><p class="st-title">We couldn't find “${esc(res.word)}”</p>
            <p class="st-sub">Check the spelling${res.suggestions.length ? ', or tap one of these:' : '.'}</p></div></div>
            ${res.suggestions.length ? `<div class="chips">${res.suggestions.map((w) => `<button class="chip" type="button" data-aw-sug="${esc(w)}">${esc(w)}</button>`).join('')}</div>` : ''}
            <div class="sheet-actions"><button class="btn btn-soft btn-block" type="button" data-aw="manual">Add it with my own meaning</button></div>`;
          out.dataset.word = res.word;
        } else {
          current = null;
          out.innerHTML = `<div class="aw-msg">${icon('wifi', 20)}<div><p class="st-title">Can't look it up right now</p>
            <p class="st-sub">Looking up words needs the internet. Check your connection and try again.</p></div></div>`;
        }
      }

      function previewHtml() {
        const { card, source } = current;
        return `${renderEntry(card, { tools: false, mine: true })}
          <p class="aw-source">${icon('sparkle', 14)} ${esc(SOURCE_TEXT[source] || '')}</p>
          ${editing ? `<label class="field" style="margin-top:12px"><span class="field-label">Meaning</span>
              <textarea class="textarea" data-aw-m rows="2" maxlength="160">${esc(card.m)}</textarea></label>
            <label class="field"><span class="field-label">Hindi</span>
              <input class="input" data-aw-hi type="text" maxlength="80" value="${esc(card.hi || '')}" placeholder="Optional"></label>` : ''}
          <div class="sheet-actions">
            <button class="btn btn-primary btn-block" type="button" data-aw="add">${icon('plus', 20)} Add to my words</button>
            ${editing ? '' : '<button class="btn btn-ghost btn-block" type="button" data-aw="edit">Edit meaning or Hindi</button>'}
            <button class="btn btn-ghost btn-block" type="button" data-aw="search">${icon('search', 18)} Search on Google</button>
          </div>`;
      }

      function manualHtml(word) {
        return `<label class="field" style="margin-top:16px"><span class="field-label">What does “${esc(word)}” mean?</span>
            <textarea class="textarea" data-aw-m rows="2" maxlength="160" placeholder="In your own simple words"></textarea></label>
          <label class="field"><span class="field-label">Hindi</span>
            <input class="input" data-aw-hi type="text" maxlength="80" placeholder="Optional"></label>
          <label class="field"><span class="field-label">An example sentence</span>
            <input class="input" data-aw-ex type="text" maxlength="140" placeholder="Optional"></label>
          <div class="sheet-actions"><button class="btn btn-primary btn-block" type="button" data-aw="add-manual">${icon('plus', 20)} Add to my words</button></div>`;
      }

      function finish(card) {
        const saved = addOwnWord(card, { store, engine });
        haptic(15);
        close();
        toast(`“${saved.w}” added to your words. It joins your revision from tomorrow.`);
        onAdded?.(saved);
      }

      el.addEventListener('click', (e) => {
        const sug = e.target.closest('[data-aw-sug]');
        if (sug) return look(sug.dataset.awSug);
        const b = e.target.closest('[data-aw], [data-act="hear"]');
        if (!b) return;
        if (b.dataset.act === 'hear') return speak(current?.card.w || input.value, current?.card.audio, b);
        const act = b.dataset.aw;
        if (act === 'look') look();
        else if (act === 'edit') { editing = true; out.innerHTML = previewHtml(); out.querySelector('[data-aw-m]')?.focus(); }
        else if (act === 'search') openSearch(current?.card.w || input.value);
        else if (act === 'add' && current) {
          const card = { ...current.card };
          const m = out.querySelector('[data-aw-m]');
          const hi = out.querySelector('[data-aw-hi]');
          if (m) {
            const v = m.value.trim();
            if (!v) return setError('Add a meaning first.');
            if (v !== card.m) { card.m = v; card.id = ''; } // edited: save as the user's own card
          }
          if (hi && hi.value.trim() !== (card.hi || '')) { card.hi = hi.value.trim(); card.him = ''; card.id = ''; }
          finish(card);
        } else if (act === 'manual') {
          out.innerHTML = manualHtml(out.dataset.word);
          out.querySelector('[data-aw-m]').focus();
        } else if (act === 'add-manual') {
          const word = out.dataset.word;
          const m = out.querySelector('[data-aw-m]').value.trim();
          if (!m) return setError('Add a meaning first.');
          const ex = out.querySelector('[data-aw-ex]').value.trim();
          finish({ id: '', w: word, p: '', ipa: '', say: '', m, ex: ex ? [{ t: 'Example', s: ex }] : [],
            hi: out.querySelector('[data-aw-hi]').value.trim(), him: '', d: 3, t: ['mine'] });
        }
      });
    },
  });
}
