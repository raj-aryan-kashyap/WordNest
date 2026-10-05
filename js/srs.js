/**
 * Spaced revision (a simple Leitner system).
 *
 * Each learning word sits in a "box". Right answers move it up a box and
 * push the next revision further away. Wrong answers drop it two boxes and
 * make it due today, so it comes back quickly (in Learn quick checks and
 * at the top of the next daily revision).
 */
import { addDays, diffDays, dayKey } from './utils.js';

export const INTERVALS = [0, 1, 2, 4, 7, 14, 30, 60]; // days until next revision, per box
export const MASTER_BOX = 6;                          // 30+ days apart = mastered

export function newRecord(card, today = dayKey()) {
  return {
    id: card.id, w: card.w, s: 'learning', box: 0,
    due: addDays(today, 1), ok: 0, bad: 0,
    add: today, last: null, lw: false, u: Date.now(),
  };
}

export function knownRecord(card, today = dayKey()) {
  return {
    id: card.id, w: card.w, s: 'known', box: 0,
    due: null, ok: 0, bad: 0,
    add: today, last: null, lw: false, u: Date.now(),
  };
}

/**
 * Update a record after a quiz answer. Mutates and returns rec.
 * Early practice (word not due yet) never pushes a word up, so extra
 * practice can't skip real spacing.
 */
export function grade(rec, correct, today = dayKey()) {
  const early = rec.due && rec.due > today;
  rec.last = today;
  rec.u = Date.now();
  if (correct) {
    rec.ok++;
    rec.lw = false;
    if (!early) {
      rec.box = Math.min(rec.box + 1, INTERVALS.length - 1);
      rec.due = addDays(today, INTERVALS[rec.box]);
    }
  } else {
    rec.bad++;
    rec.lw = true;
    rec.box = Math.max(0, rec.box - 2);
    rec.due = today;
  }
  rec.s = rec.box >= MASTER_BOX ? 'mastered' : 'learning';
  return rec;
}

/** Higher = should be revised sooner. */
export function priority(rec, today = dayKey()) {
  const overdue = rec.due ? Math.max(0, diffDays(rec.due, today)) : 0;
  const errorRate = (rec.bad + 1) / (rec.ok + rec.bad + 2);
  return overdue + errorRate * 4 + (INTERVALS.length - rec.box) * 0.35 + (rec.lw ? 2 : 0);
}

const inRevision = (r) => r.s === 'learning' || r.s === 'mastered';

/**
 * Words for a revision round. Only words added before today count,
 * so revision starts from day 2. Due words first, then the weakest others.
 */
export function pickReview(words, n, { today = dayKey(), exclude = new Set() } = {}) {
  const eligible = Object.values(words).filter((r) => inRevision(r) && r.add < today && !exclude.has(r.id));
  const byPriority = (a, b) => priority(b, today) - priority(a, today);
  const due = eligible.filter((r) => r.due && r.due <= today).sort(byPriority);
  const out = due.slice(0, n);
  if (out.length < n) {
    const rest = eligible.filter((r) => !out.includes(r)).sort(byPriority);
    out.push(...rest.slice(0, n - out.length));
  }
  return out;
}

/**
 * Daily revision status for Home and Learn.
 *  none     no learning words yet
 *  tomorrow words exist but all were added today
 *  ready    revision waiting
 *  done     finished today
 */
export function reviewStatus(state, size, today = dayKey()) {
  const words = Object.values(state.words).filter(inRevision);
  if (!words.length) return { state: 'none', count: 0 };
  const eligible = words.filter((r) => r.add < today);
  if (!eligible.length) return { state: 'tomorrow', count: 0 };
  const log = state.reviews[today];
  if (log && log.done) return { state: 'done', count: eligible.length, ok: log.ok, total: log.total };
  return { state: 'ready', count: Math.min(size, eligible.length) };
}

/** A missed word waiting for a quick check in Learn. */
export function pickRecheck(words, { today = dayKey(), exclude = new Set() } = {}) {
  return Object.values(words)
    .filter((r) => inRevision(r) && r.lw && r.due && r.due <= today && !exclude.has(r.id))
    .sort((a, b) => priority(b, today) - priority(a, today))[0] || null;
}
