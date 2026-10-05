/**
 * Live status for sync and word finding, shown by the small status icon.
 * Anything can update it; the icon and the status sheet listen.
 */
const listeners = new Set();

const state = {
  sync: { phase: 'off', last: 0, error: '' },          // off | idle | running | ok | error
  words: {
    phase: 'idle', error: '',                         // idle | running | error
    ready: 0,                                         // good-fit words waiting in the queue
    lastAdded: 0, lastSource: '', lastAt: 0,
    ai: null,                                         // { on, used, limit } from the sheet
    aiPausedUntil: 0,                                 // free-limit cooldown
  },
};

export const status = {
  get: () => state,
  set(part, patch) {
    Object.assign(state[part], patch);
    for (const fn of listeners) {
      try { fn(state); } catch (e) { console.error(e); }
    }
  },
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export const SOURCE_NAME = {
  server: 'Gemini, via your Google Sheet',
  phone: 'Gemini, with the key on this phone',
  claude: 'Claude (preview)',
  datamuse: 'Free dictionary',
  library: 'Shared Library',
};
