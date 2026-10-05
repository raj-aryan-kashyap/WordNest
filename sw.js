/**
 * Service worker: makes the app open fast and work offline.
 * - App files: served from this version's cache only, so a phone never mixes
 *   old and new files. A new VERSION downloads the full new set, then switches.
 * - Google Fonts: cached after first use.
 * - Word APIs and sync: always network (never cached here).
 * Bump VERSION when you deploy changes so phones pick them up.
 */
const VERSION = 'wn-1.7.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/app.js', './js/config.js', './js/goals.js', './js/library.js', './js/status.js', './js/statusview.js', './js/addword.js', './js/utils.js', './js/store.js', './js/srs.js',
  './js/engine.js', './js/sources.js', './js/quiz.js', './js/sync.js', './js/ui.js', './js/components.js',
  './js/data/seed.js',
  './js/screens/onboarding.js', './js/screens/home.js', './js/screens/learn.js',
  './js/screens/review.js', './js/screens/words.js', './js/screens/me.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];
const FONT_CACHE = 'wn-fonts';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request, { ignoreSearch: cacheName === VERSION });
    const network = fetch(request)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
        return res;
      })
      .catch(() => cached);
    return cached || network;
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // Page navigations fall back to the cached shell when offline.
    if (request.mode === 'navigate') {
      event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
      return;
    }
    event.respondWith(
      caches.open(VERSION).then((cache) => cache.match(request, { ignoreSearch: true })
        .then((hit) => hit || fetch(request).then((res) => {
          if (res && res.ok) cache.put(request, res.clone());
          return res;
        }))),
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
  }
  // Everything else (word APIs, sync) goes straight to the network.
});
