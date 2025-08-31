/* Simple service worker for offline caching */
const CACHE = 'mosaed-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/style.css',
  './assets/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Network first for navigation; cache first for assets
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
  } else {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (req.method === 'GET' && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached))
    );
  }
});
