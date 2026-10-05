/**
 * Cross-device sync with a free Google Apps Script web app + Google Sheet.
 *
 * Sign in = a name + PIN. The PIN is hashed on the phone before sending.
 * Each sync sends this phone's data; the server merges it with what it has
 * (word by word, newest change wins), saves, and sends the merged result
 * back. The same merge runs here, so changes made during a sync are kept.
 */
import { CONFIG } from './config.js';
import { sha256 } from './utils.js';
import { status } from './status.js';
import { pendingLibrary, markLibrarySent, wantedContexts, libraryRowsToCards, resetLibrarySent } from './library.js';

export const syncConfigured = () => !!CONFIG.SYNC_URL && !CONFIG.PREVIEW;
export const syncEnabled = (store) => !!(syncConfigured() && store.state.sync.user && store.state.sync.pinHash);

export function cleanName(name) {
  return String(name || '').trim().toLowerCase();
}

export function validName(name) {
  return /^[a-z0-9._-]{2,40}$/.test(cleanName(name));
}

async function call(action, body) {
  let res;
  try {
    // text/plain avoids a CORS preflight, which Apps Script cannot answer.
    res = await fetch(CONFIG.SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...body }),
      redirect: 'follow',
    });
  } catch {
    const e = new Error("Couldn't reach the sync server. Check your internet.");
    e.code = 'network';
    throw e;
  }
  let data;
  try { data = await res.json(); } catch { data = { ok: false, code: 'server', error: 'The sync server sent an unexpected reply.' }; }
  if (!data.ok) {
    const e = new Error(data.error || 'Sync failed.');
    e.code = data.code || 'server';
    e.data = data;
    throw e;
  }
  return data;
}

/** Data we send: everything except sign-in details, plus content for words still being learned. */
export function snapshot(store) {
  const { sync, ...state } = store.state;
  const cards = {};
  for (const [id, rec] of Object.entries(state.words)) {
    if (rec.s !== 'known' && store.cards[id] && !id.startsWith('s:')) cards[id] = store.cards[id];
  }
  return { state, cards };
}

/** Merge two snapshots. Must stay in step with mergeSnap() in google-sheet/2_APPS_SCRIPT_CODE.txt. */
export function mergeSnap(a, b) {
  if (!a || !a.state) return b;
  if (!b || !b.state) return a;
  const A = a.state;
  const B = b.state;
  const newer = (x, y) => (((y && y.u) || 0) > ((x && x.u) || 0) ? y : x);

  const state = { ...A };
  state.profile = { ...newer(A.profile, B.profile) };
  state.profile.onboarded = !!((A.profile && A.profile.onboarded) || (B.profile && B.profile.onboarded));
  state.model = newer(A.model, B.model);

  const words = { ...(A.words || {}) };
  for (const id of Object.keys(B.words || {})) {
    const bw = B.words[id];
    const aw = words[id];
    if (!aw || (bw.u || 0) > (aw.u || 0)) words[id] = bw;
  }
  state.words = words;

  const seen = new Set();
  const history = [];
  for (const h of [...(A.history || []), ...(B.history || [])]) {
    const k = `${h.t}|${h.id}|${h.k}`;
    if (!seen.has(k)) { seen.add(k); history.push(h); }
  }
  history.sort((x, y) => x.t - y.t);
  state.history = history.slice(-1500);

  state.days = [...new Set([...(A.days || []), ...(B.days || [])])].sort();

  const reviews = { ...(B.reviews || {}), ...(A.reviews || {}) };
  for (const d of Object.keys(B.reviews || {})) {
    if (B.reviews[d].done && !(A.reviews && A.reviews[d] && A.reviews[d].done)) reviews[d] = B.reviews[d];
  }
  state.reviews = reviews;

  return { state, cards: { ...(b.cards || {}), ...(a.cards || {}) } };
}

let running = null;
let onLibraryCards = null;

/** app.js passes a handler that adds Library words to the engine. */
export function setLibraryHandler(fn) { onLibraryCards = fn; }

/** Sync now. Safe to call often; overlapping calls share one request. */
export function syncNow(store) {
  if (!syncEnabled(store)) {
    status.set('sync', { phase: 'off' });
    return Promise.resolve({ skipped: true });
  }
  if (running) return running;
  status.set('sync', { phase: 'running', error: '' });
  running = (async () => {
    const { user, pinHash } = store.state.sync;
    try {
      const library = pendingLibrary(store);
      const res = await call('sync', {
        user, pin: pinHash, data: snapshot(store),
        library, contexts: wantedContexts(store.state.profile),
      });
      if (res.data) store.applyMerged(mergeSnap(snapshot(store), res.data));
      if (library.length) markLibrarySent(library.map((x) => x.id));
      if (res.offer && onLibraryCards) onLibraryCards(libraryRowsToCards(res.offer));
      if (res.ai) status.set('words', { ai: res.ai });
      store.update((s) => { s.sync.last = Date.now(); s.sync.error = ''; }, { sync: false });
      status.set('sync', { phase: 'ok', last: Date.now() });
      return { ok: true };
    } catch (e) {
      store.update((s) => { s.sync.error = e.message; }, { sync: false });
      status.set('sync', { phase: 'error', error: e.message });
      if (e.code === 'wrong_pin' || e.code === 'no_user') {
        store.update((s) => { s.sync.pinHash = ''; }, { sync: false });
      }
      throw e;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Sign in or create an account. Returns { created }. */
export async function signIn(store, name, pin) {
  const user = cleanName(name);
  const pinHash = await sha256(`${user}:${pin}:wordnest`);
  const res = await call('login', { user, pin: pinHash });
  resetLibrarySent(); // a different sheet may not have this phone's words yet
  store.update((s) => { s.sync.user = user; s.sync.pinHash = pinHash; s.sync.error = ''; }, { sync: false });
  await syncNow(store);
  return { created: !!res.created };
}

/** Ask the sheet for smart word picks (Gemini runs there). Returns the raw response. */
export async function suggestFromServer(store, request) {
  if (!syncEnabled(store)) return { ok: false, code: 'no_sync' };
  const { user, pinHash } = store.state.sync;
  try {
    return await call('suggest', { user, pin: pinHash, ...request });
  } catch (e) {
    // call() throws on ok:false; hand the code back so the engine can decide.
    if (e.data) return e.data; // includes ai usage and retryIn
    throw e;
  }
}

export function signOut(store) {
  status.set('sync', { phase: 'off', last: 0, error: '' });
  store.update((s) => { s.sync = { user: '', pinHash: '', last: 0, error: '' }; }, { sync: false });
}
