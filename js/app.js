/**
 * WordNest entry point: creates the store and engine, runs the hash router,
 * wires background sync, offline notice and the service worker.
 *
 * Routes: #/welcome  #/home  #/learn  #/review?mode=daily|extra  #/words  #/me
 */
import { Store } from './store.js';
import { Engine } from './engine.js';
import { renderTabbar, isSheetOpen, closeSheet, sheetHistorySettled, toast } from './ui.js';
import { syncEnabled, syncNow, setLibraryHandler, suggestFromServer } from './sync.js';
import { markLibrarySent } from './library.js';
import { status } from './status.js';
import { statusChip } from './components.js';
import { openStatusSheet } from './statusview.js';
import { reviewStatus } from './srs.js';
import { CONFIG } from './config.js';
import { debounce, dayKey } from './utils.js';

import * as welcome from './screens/onboarding.js';
import * as home from './screens/home.js';
import * as learn from './screens/learn.js';
import * as review from './screens/review.js';
import * as words from './screens/words.js';
import * as me from './screens/me.js';

const SCREENS = { welcome, home, learn, review, words, me };
const TAB_SCREENS = new Set(['home', 'learn', 'words', 'me']);
const PASSIVE = new Set(['home', 'words']); // safe to re-render when synced data arrives

const store = new Store();
const engine = new Engine(store);
const appEl = document.getElementById('app');

let cleanup = null;
let current = null;
let renderedDay = dayKey();

/* ---------- Router ---------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, query] = raw.split('?');
  return { name: name || 'home', params: new URLSearchParams(query || '') };
}

function go(route, { replace = false } = {}) {
  const target = '#/' + route;
  const navigate = () => {
    if (location.hash === target) return render();
    if (replace) location.replace(target);
    else location.hash = target;
  };
  // A sheet adds a history entry; remove it first so navigation is not undone.
  if (isSheetOpen()) closeSheet();
  sheetHistorySettled().then(navigate);
}

function render() {
  const { name, params } = parseHash();
  const onboarded = store.state.profile.onboarded;

  if (!onboarded && name !== 'welcome') return go('welcome', { replace: true });
  if (onboarded && name === 'welcome' && !params.get('edit')) return go('home', { replace: true });
  const screen = SCREENS[name] ? name : 'home';

  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  current = screen;
  renderedDay = dayKey();

  appEl.dataset.screen = screen;
  appEl.onclick = null;
  window.scrollTo(0, 0);

  const ctx = { store, engine, go };
  try {
    cleanup = SCREENS[screen].mount(appEl, ctx, params) || null;
  } catch (e) {
    console.error(e);
    appEl.innerHTML = `<div class="state"><h2>Something went wrong</h2><p>Reload the app to try again. Your words are safe.</p>
      <button class="btn btn-primary" onclick="location.reload()">Reload</button></div>`;
  }

  const rs = reviewStatus(store.state, CONFIG.DAILY_REVIEW_SIZE);
  renderTabbar(TAB_SCREENS.has(screen) ? screen : null, { badge: { home: rs.state === 'ready' && screen !== 'home' } });
  appEl.focus({ preventScroll: true });
}

window.addEventListener('hashchange', render);

document.getElementById('tabbar').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (!tab) return;
  if (tab.dataset.tab === current) return window.scrollTo({ top: 0, behavior: 'smooth' });
  go(tab.dataset.tab);
});

// The streak pill on any screen leads home.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="go-home"]') && current !== 'home') go('home');
});

/* ---------- Background sync ---------- */
async function backgroundSync() {
  if (!syncEnabled(store) || !navigator.onLine) return;
  try {
    await syncNow(store);
    if (PASSIVE.has(current)) render();
  } catch (e) {
    console.warn('Sync failed:', e.message);
  }
}
store.onDirty = debounce(backgroundSync, 6000);
setLibraryHandler((cards) => engine.addLibraryCards(cards));

/* ---------- Smart picks through the sheet (Gemini key lives there) ---------- */
engine.serverSuggest = (request) => (syncEnabled(store) ? suggestFromServer(store, request) : Promise.resolve({ ok: false, code: 'no_sync' }));
engine.onSentToLibrary = (ids) => markLibrarySent(ids);

/* ---------- Status icon: update in place, open details on tap ---------- */
status.set('sync', { phase: syncEnabled(store) ? 'idle' : 'off', last: store.state.sync.last || 0 });
status.on(() => {
  document.querySelectorAll('[data-status-chip]').forEach((el) => { el.outerHTML = statusChip(); });
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="status"]')) openStatusSheet(store, engine);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    store.flush();
    if (syncEnabled(store)) syncNow(store).catch(() => {});
  } else {
    // Back in the app: a new day may have started (streak, revision).
    if (dayKey() !== renderedDay && current !== 'review') render();
    backgroundSync();
  }
});

/* ---------- Offline notice ---------- */
const banner = document.getElementById('net-banner');
function updateNet() {
  banner.hidden = navigator.onLine;
}
window.addEventListener('online', () => { updateNet(); backgroundSync(); });
window.addEventListener('offline', updateNet);
updateNet();

/* ---------- Start ---------- */
if (!store.storageOk) {
  setTimeout(() => toast("This browser is blocking saving. Your progress won't be kept."), 600);
}
render();
backgroundSync();

if (!CONFIG.PREVIEW && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker failed', e));
}
