// Offline support. App files are cached on install; the speech engine runtime (from the jsDelivr CDN)
// is cached the first time it is used. Model files are cached by the speech library itself.
const VERSION = 'bolo-1.2.0';
const ENGINE = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/speech.js', 'js/analysis.js', 'js/home.js', 'js/speak.js', 'js/talk.js', 'js/live.js', 'js/avatar.js', 'js/practice.js',
  'js/stt-worker.js', 'js/llm-worker.js', 'js/data/scenarios.js', 'js/data/content.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];
const RUNTIME = 'bolo-runtime';

self.addEventListener('install', e => {
  // The speech engine comes from the CDN; fetch it now (best effort) so it is there when offline.
  caches.open(RUNTIME).then(c => c.match(ENGINE).then(hit => hit || c.add(ENGINE))).catch(() => {});
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('bolo-') && k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // App files: answer from cache at once, refresh the cache in the background.
    e.respondWith(caches.open(VERSION).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const res = (await net) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
      return res || Response.error();
    }));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(RUNTIME).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }));
  }
});
