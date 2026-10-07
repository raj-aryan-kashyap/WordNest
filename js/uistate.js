/**
 * What is on screen right now, kept for this browser tab only.
 *
 * Phones (especially Android Chrome) often unload a page in the background
 * and reload it when you come back. Progress is safe in localStorage, but
 * the screen state (the word you were looking at, a half-done quiz, scroll
 * position) would be lost. sessionStorage survives those reloads for the
 * same tab, so screens save their state here and restore it on mount.
 */
const PREFIX = 'wn.ui.';

export const uiState = {
  get(key) {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try { sessionStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage blocked */ }
  },
  clear(key) {
    try { sessionStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  },
};
