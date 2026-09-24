/* HoloStudy LMS service worker — offline app shell + engines cached on install. */
const CACHE = 'holostudy-lms-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/curriculum.js',
  './engines/holograms/index.html',
  './engines/holograms/holo.js',
  './engines/holograms/vendor/three.min.js',
  './engines/study/study.html',
  './engines/study/holostudy-demos.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // cache each asset individually so one missing file can't abort the whole install
      Promise.all(ASSETS.map((u) => c.add(u).catch((err) => console.warn('SW skip', u, err))))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // never cache cross-origin (e.g. pdf.js CDN) — just pass through
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
