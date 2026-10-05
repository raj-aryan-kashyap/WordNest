/**
 * Shared UI pieces: icons, flags, toast, bottom sheet, tab bar, speech, search.
 */
import { esc, haptic, prefersReducedMotion } from './utils.js';

/** App logo path (the preview build swaps this for an inline copy). */
export const BRAND_ICON = 'icons/icon.svg';

/* ---------- Icons (24px stroke icons) ---------- */
const PATHS = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z"/>',
  learn: '<rect x="3.5" y="4" width="13" height="16.5" rx="2.5"/><path d="M20.5 7.5v10.5a2.5 2.5 0 0 1-2.5 2.5"/><path d="M7.5 9h5M7.5 13h5"/>',
  words: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="17.5" r="1.2"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  volume: '<path d="M11 5 6.5 9H3.5v6h3L11 19z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  repeat: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v1.5A3.5 3.5 0 0 1 17 18H3.5"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9l2.2-2.4"/><path d="M20.5 20.5v-5h-5"/>',
  sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M19 16.5v4M17 18.5h4"/>',
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.7-1.4A4.5 4.5 0 0 0 7 18.5z"/><path d="m9.5 13.5 2 2 3.5-3.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};

export function icon(name, size = 22) {
  if (name === 'flame') {
    return `<svg class="ic ic--fill" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.6 2.5c.5 3-1.2 4.6-2.6 6.2C8.5 10.4 7 12.1 7 14.8a5 5 0 0 0 10 0c0-1.9-.8-3.4-1.8-4.6-.2 1.2-.8 2.2-1.9 2.7.6-3.6-.4-7.5-.7-10.4z"/></svg>`;
  }
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

/* ---------- Round flags (drawn in SVG so they look the same on every phone) ---------- */
export function flag(code) {
  if (code === 'en') {
    return `<svg viewBox="0 0 60 60" aria-hidden="true"><defs><clipPath id="fl-en"><circle cx="30" cy="30" r="30"/></clipPath></defs>
      <g clip-path="url(#fl-en)"><rect width="60" height="60" fill="#012169"/>
      <path d="M-5 0 65 60M65 0-5 60" stroke="#fff" stroke-width="12"/>
      <path d="M-5 0 65 60M65 0-5 60" stroke="#C8102E" stroke-width="4"/>
      <path d="M30 0v60M0 30h60" stroke="#fff" stroke-width="18"/>
      <path d="M30 0v60M0 30h60" stroke="#C8102E" stroke-width="10"/></g></svg>`;
  }
  return `<svg viewBox="0 0 60 60" aria-hidden="true"><defs><clipPath id="fl-pt"><circle cx="30" cy="30" r="30"/></clipPath></defs>
    <g clip-path="url(#fl-pt)"><rect width="60" height="60" fill="#DA291C"/><rect width="24" height="60" fill="#046A38"/>
    <circle cx="24" cy="30" r="10.5" fill="none" stroke="#FFE900" stroke-width="3"/>
    <path d="M19 24.5h10v7.5a5 5 0 0 1-10 0z" fill="#fff" stroke="#DA291C" stroke-width="1.6"/>
    <path d="M21.5 27h5v4.5a2.5 2.5 0 0 1-5 0z" fill="#002D72"/></g></svg>`;
}

/* ---------- Toast ---------- */
export function toast(message, { action, onAction, duration = 3200 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return () => {};
  root.querySelectorAll('.toast').forEach((t) => t.remove()); // one at a time
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="toast-msg">${esc(message)}</span>${action ? `<button class="toast-act" type="button">${esc(action)}</button>` : ''}`;
  root.appendChild(el);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 200);
  };
  if (action) {
    el.querySelector('.toast-act').addEventListener('click', () => {
      haptic();
      close();
      onAction?.();
    });
  }
  setTimeout(close, action ? Math.max(duration, 4500) : duration);
  return close;
}

/* ---------- Bottom sheet ---------- */
let openSheetClose = null;
let historySettling = null; // promise while we undo the sheet's history entry

/** Resolves once the sheet's history entry is gone (or right away). */
export function sheetHistorySettled() {
  return historySettling || Promise.resolve();
}

/**
 * Open a bottom sheet. `render(el)` fills it; return value of sheet() closes it.
 * Closes on scrim tap, Escape, or the phone back button.
 */
export function sheet({ html, onMount, onClose, label = 'Details' }) {
  openSheetClose?.(true);
  const root = document.getElementById('sheet-root');
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  const panel = document.createElement('div');
  panel.className = 'sheet';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', label);
  panel.innerHTML = `<div class="sheet-handle" aria-hidden="true"></div>${html}`;
  root.append(scrim, panel);
  document.body.style.overflow = 'hidden';

  let closed = false;
  const close = (instant = false, fromBack = false) => {
    if (closed) return;
    closed = true;
    openSheetClose = null;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('popstate', onPop);
    if (!fromBack && history.state && history.state.sheet) {
      historySettling = new Promise((res) => {
        const finish = () => { window.removeEventListener('popstate', finish); historySettling = null; res(); };
        window.addEventListener('popstate', finish);
        setTimeout(finish, 400); // safety net
      });
      history.back();
    }
    const done = () => { scrim.remove(); panel.remove(); document.body.style.overflow = ''; onClose?.(); };
    if (instant || prefersReducedMotion()) return done();
    panel.classList.add('is-closing');
    scrim.classList.add('is-closing');
    setTimeout(done, 200);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const onPop = () => close(false, true);
  document.addEventListener('keydown', onKey);
  // Let the phone back button close the sheet instead of leaving the screen.
  history.pushState({ sheet: true }, '');
  window.addEventListener('popstate', onPop);
  scrim.addEventListener('click', () => close());
  openSheetClose = close;
  onMount?.(panel, close);
  panel.querySelector('button, input, textarea')?.focus({ preventScroll: true });
  return close;
}

export function closeSheet() { openSheetClose?.(true); }
export const isSheetOpen = () => !!openSheetClose;

/** Promise<boolean> confirm dialog in a sheet. */
export function confirmSheet({ title, text, okLabel = 'Yes', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    sheet({
      label: title,
      html: `<h2 class="sheet-title">${esc(title)}</h2>${text ? `<p class="sheet-text">${esc(text)}</p>` : ''}
        <div class="sheet-actions">
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" data-ok>${esc(okLabel)}</button>
          <button class="btn btn-soft btn-block" data-cancel>${esc(cancelLabel)}</button>
        </div>`,
      onMount(el, close) {
        el.querySelector('[data-ok]').addEventListener('click', () => { answer = true; close(); });
        el.querySelector('[data-cancel]').addEventListener('click', () => close());
      },
      onClose: () => resolve(answer),
    });
  });
}

/* ---------- Tab bar ---------- */
const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'learn', label: 'Learn', icon: 'learn' },
  { id: 'words', label: 'My words', icon: 'words' },
  { id: 'me', label: 'Me', icon: 'me' },
];

export function renderTabbar(active, { badge = {} } = {}) {
  const nav = document.getElementById('tabbar');
  if (!active) {
    nav.hidden = true;
    document.body.classList.add('no-tabbar');
    return;
  }
  nav.hidden = false;
  document.body.classList.remove('no-tabbar');
  nav.innerHTML = `<div class="tabbar-inner">${TABS.map((t) => `
    <button class="tab ${t.id === active ? 'is-on' : ''}" data-tab="${t.id}" ${t.id === active ? 'aria-current="page"' : ''}>
      ${icon(t.icon, 24)}<span>${t.label}</span>${badge[t.id] ? '<i class="tab-badge" aria-label="Something is waiting"></i>' : ''}
    </button>`).join('')}</div>`;
}

/* ---------- Pronunciation ---------- */
let voice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => /en[-_]US/i.test(v.lang) && /google|natural|samantha/i.test(v.name))
    || voices.find((v) => /en[-_](US|GB)/i.test(v.lang))
    || voices.find((v) => /^en/i.test(v.lang)) || null;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
}

/** Say a word out loud. Uses the phone's voice, or the dictionary recording. */
export function speak(text, audioUrl, button) {
  haptic();
  const mark = (on) => button?.classList.toggle('is-playing', on);
  if ('speechSynthesis' in window) {
    voice = voice || pickVoice();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang || 'en-US';
    if (voice) u.voice = voice;
    u.rate = 0.9;
    u.onstart = () => mark(true);
    u.onend = u.onerror = () => mark(false);
    speechSynthesis.speak(u);
    return;
  }
  if (audioUrl) {
    const a = new Audio(audioUrl);
    mark(true);
    a.onended = a.onerror = () => mark(false);
    a.play().catch(() => { mark(false); toast("Sound isn't working on this phone right now."); });
    return;
  }
  toast("Sound isn't available on this phone.");
}

/** Open a Google search for the word's meaning in English and Hindi. */
export function openSearch(word) {
  haptic();
  const q = encodeURIComponent(`${word} meaning in English and Hindi`);
  window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener');
}
