/**
 * Store: the single source of truth for user progress.
 * Saves to localStorage on this phone. sync.js copies it to the cloud.
 *
 * state.words[id] = {
 *   id, w        word id + text
 *   s            'learning' | 'mastered' | 'known'
 *   box          revision level 0..7 (higher = remembered better)
 *   due          day key when it should be revised next
 *   ok, bad      right / wrong answer counts
 *   add          day it was first marked
 *   last         last day it was revised
 *   lw           true if the last answer was wrong
 *   u            last change time (ms), used to merge devices
 * }
 */
import { dayKey, addDays, debounce } from './utils.js';

const KEYS = {
  state: 'wn.state.v1',
  cards: 'wn.cards.v1',   // full content for words that came from online sources
  pool: 'wn.pool.v1',     // upcoming online word ideas (not shown yet)
  ai: 'wn.ai.v1',         // optional Gemini key, never synced
  libsent: 'wn.libsent.v1', // word ids already sent to the sheet's Library
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function freshState() {
  return {
    v: 1,
    profile: {
      name: '',
      lang: null,            // language being learned: 'en' (pt coming later)
      goals: [],             // ready-made goal ids, see goals.js
      custom: [],            // goals the user wrote
      context: '',           // old single-text goal (moved into custom on load)
      level: 'middle',       // 'beginner' | 'middle' | 'advanced'
      onboarded: false,
      u: 0,
    },
    model: { skill: null, tagW: {}, rot: 0, u: 0 }, // learner model for word picks
    words: {},
    history: [],             // [{ t, id, k }] k: n = new, k = known, r1 = right, r0 = wrong
    days: [],                // active day keys, for the streak
    reviews: {},             // { [dayKey]: { done, ok, total } }
    sync: { user: '', pinHash: '', last: 0, error: '' },
  };
}

function withDefaults(s = {}) {
  const f = freshState();
  const profile = { ...f.profile, ...(s.profile || {}) };
  // Older saves had one text goal: keep it as the user's own goal.
  if (!Array.isArray(profile.goals)) profile.goals = [];
  if (!Array.isArray(profile.custom)) profile.custom = [];
  if (profile.context && !profile.goals.length && !profile.custom.length) profile.custom = [String(profile.context).slice(0, 120)];
  profile.context = '';
  return {
    ...f,
    ...s,
    profile,
    model: { ...f.model, ...(s.model || {}), tagW: { ...((s.model && s.model.tagW) || {}) } },
    sync: { ...f.sync, ...(s.sync || {}) },
    words: s.words || {},
    history: Array.isArray(s.history) ? s.history : [],
    days: Array.isArray(s.days) ? s.days : [],
    reviews: s.reviews || {},
  };
}

export class Store {
  constructor() {
    this.storageOk = write('wn.check', 1);
    this.state = withDefaults(read(KEYS.state, {}));
    this.cards = read(KEYS.cards, {});
    this.pool = read(KEYS.pool, []);
    this.ai = { key: '', model: '', ...read(KEYS.ai, {}) };
    this.listeners = new Set();
    this.onDirty = null; // set by app.js to trigger a background sync
    this.persistSoon = debounce(() => this.flush(), 250);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.flush());
  }

  /** Change state. sync:false for changes that should not trigger a cloud sync. */
  update(fn, { sync = true } = {}) {
    fn(this.state);
    this.persistSoon();
    if (sync && this.onDirty) this.onDirty();
    this.emit();
  }

  touchCards() { this.persistSoon(); }

  setPool(pool) {
    this.pool = pool;
    this.persistSoon();
  }

  setAi(patch) {
    this.ai = { ...this.ai, ...patch };
    write(KEYS.ai, this.ai);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) {
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  /** Write everything to localStorage. If storage is full, trim the least useful data. */
  flush() {
    this.persistSoon.cancel();
    if (!write(KEYS.state, this.state)) {
      this.state.history = this.state.history.slice(-400);
      write(KEYS.state, this.state);
    }
    if (!write(KEYS.cards, this.cards)) {
      // Drop cached content for words marked as known (they can be fetched again).
      for (const [id, rec] of Object.entries(this.state.words)) {
        if (rec.s === 'known') delete this.cards[id];
      }
      write(KEYS.cards, this.cards);
    }
    if (!write(KEYS.pool, this.pool)) {
      this.pool = this.pool.slice(-80);
      write(KEYS.pool, this.pool);
    }
  }

  /* ---------- Streak + counts ---------- */

  /** Marks today as a learning day. Returns true the first time each day. */
  markActive() {
    const today = dayKey();
    if (this.state.days.includes(today)) return false;
    this.update((s) => {
      s.days.push(today);
      s.days.sort();
    });
    return true;
  }

  isActiveToday() {
    return this.state.days.includes(dayKey());
  }

  /** Current streak. It survives until the end of today if yesterday was active. */
  streak() {
    const set = new Set(this.state.days);
    let d = dayKey();
    if (!set.has(d)) d = addDays(d, -1);
    let n = 0;
    while (set.has(d)) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }

  bestStreak() {
    const days = [...new Set(this.state.days)].sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const d of days) {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    return best;
  }

  counts() {
    let learning = 0;
    let known = 0;
    let mastered = 0;
    for (const r of Object.values(this.state.words)) {
      if (r.s === 'known') known++;
      else if (r.s === 'mastered') mastered++;
      else learning++;
    }
    return { learning, known, mastered, total: learning + known + mastered };
  }

  addedToday() {
    const t = dayKey();
    let n = 0;
    for (const r of Object.values(this.state.words)) if (r.add === t && r.s !== 'known') n++;
    return n;
  }

  /* ---------- Backup + reset ---------- */

  exportData() {
    return { app: 'WordNest', version: 1, exported: new Date().toISOString(), state: { ...this.state, sync: undefined }, cards: this.cards };
  }

  importData(obj) {
    if (!obj || typeof obj !== 'object' || !obj.state || typeof obj.state.words !== 'object') {
      throw new Error('This file is not a WordNest backup.');
    }
    const keepSync = this.state.sync;
    this.state = withDefaults(obj.state);
    this.state.sync = keepSync;
    this.cards = obj.cards && typeof obj.cards === 'object' ? obj.cards : {};
    this.flush();
    this.emit();
  }

  /** Replace state after a cloud merge, keeping this phone's sign-in details. */
  applyMerged({ state, cards }) {
    const keepSync = this.state.sync;
    this.state = withDefaults(state);
    this.state.sync = keepSync;
    this.cards = { ...this.cards, ...(cards || {}) };
    this.flush();
    this.emit();
  }

  reset() {
    for (const k of Object.values(KEYS)) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
    this.state = freshState();
    this.cards = {};
    this.pool = [];
    this.ai = { key: '', model: '' };
    this.flush();
    this.emit();
  }
}
