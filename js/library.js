/**
 * Master word Library (Google Sheet "Library" tab).
 *
 * Up: every word this phone has shown (with its full card) is sent once,
 *     with its context, the day it was added and who added it.
 * Down: on each sync the sheet sends back Library words this user hasn't
 *     seen yet, matching their goals first. They join the queue of new words.
 */
import { SEED } from './data/seed.js';
import { activeGoals } from './goals.js';
import { TOPIC_LABEL } from './engine.js';

const SENT_KEY = 'wn.libsent.v1';
const SOURCE = { seed: 'Starter pack', ai: 'AI', datamuse: 'Dictionary', library: 'Library', user: 'Added by user' };
const seedMap = new Map(SEED.map((c) => [c.id, c]));

function readSent() {
  try { return new Set(JSON.parse(localStorage.getItem(SENT_KEY) || '[]')); } catch { return new Set(); }
}
function writeSent(set) {
  try { localStorage.setItem(SENT_KEY, JSON.stringify([...set])); } catch { /* storage full: resend later */ }
}

/** Forget what was sent (used when signing in to a different sheet). */
export function resetLibrarySent() {
  try { localStorage.removeItem(SENT_KEY); } catch { /* ignore */ }
}

/** The Library's Context column: the user's own goal text, or the topic name. */
export function contextLabel(card, profile) {
  if (card.src === 'user') return 'Added by users';
  const goals = activeGoals(profile);
  for (const t of card.t || []) {
    if (t.startsWith('c:')) {
      const g = goals.find((x) => x.id === t);
      if (g) return g.label;
    }
  }
  for (const t of card.t || []) if (TOPIC_LABEL[t] && t !== 'ctx') return TOPIC_LABEL[t];
  return 'Everyday';
}

/** Words not yet in the sheet's Library, as flat rows. Max `max` per sync. */
export function pendingLibrary(store, max = 300) {
  const sent = readSent();
  const out = [];
  for (const r of Object.values(store.state.words)) {
    if (sent.has(r.id)) continue;
    const c = seedMap.get(r.id) || store.cards[r.id];
    if (!c) continue;
    const ex = { past: '', present: '', future: '' };
    const other = [];
    for (const e of c.ex || []) {
      const k = String(e.t || '').toLowerCase();
      if (k in ex) ex[k] = e.s;
      else other.push(e.s);
    }
    out.push({
      id: r.id, w: c.w, p: c.p || '', d: c.d || 3, m: c.m || '', say: c.say || '', ipa: c.ipa || '',
      ...ex, other: other.join(' | '), hi: c.hi || '', him: c.him || '',
      src: r.mine ? SOURCE.user : SOURCE[c.src] || c.src || '', ctx: r.mine ? 'Added by users' : contextLabel(c, store.state.profile),
      t: (c.t || []).join(','), added: r.add,
    });
    if (out.length >= max) break;
  }
  return out;
}

export function markLibrarySent(ids) {
  const sent = readSent();
  ids.forEach((id) => sent.add(id));
  writeSent(sent);
}

/** Context names this user wants, so the sheet sends matching words first. */
export function wantedContexts(profile) {
  const out = new Set(['Workplace and HR']);
  for (const g of activeGoals(profile)) {
    out.add(g.label);
    for (const t of g.tags) if (TOPIC_LABEL[t]) out.add(TOPIC_LABEL[t]);
  }
  return [...out];
}

/** Library rows from the sheet into app cards. Starter-pack words are skipped (the app has them). */
export function libraryRowsToCards(rows) {
  const cards = [];
  for (const r of rows || []) {
    const w = String(r.w || '').trim();
    if (!w || !r.m || String(r.id || '').startsWith('s:')) continue;
    const ex = [['Past', r.past], ['Present', r.present], ['Future', r.future]]
      .filter(([, s]) => s).map(([t, s]) => ({ t, s: String(s) }));
    for (const s of String(r.other || '').split(' | ').filter(Boolean)) ex.push({ t: 'Example', s });
    const tags = String(r.t || '').split(',').map((t) => t.trim()).filter(Boolean);
    cards.push({
      id: r.id || 'l:' + w.toLowerCase().replace(/\s+/g, '-'), w, p: String(r.p || ''),
      ipa: String(r.ipa || ''), say: String(r.say || ''), m: String(r.m), ex,
      hi: String(r.hi || ''), him: String(r.him || ''), d: Number(r.d) || 3,
      t: tags.length ? tags : ['general'], src: 'library',
    });
  }
  return cards;
}
