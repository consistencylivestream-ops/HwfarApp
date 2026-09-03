const CACHE_NAME = 'hwfar-app-v3';
const OFFLINE_URL = '/offline.html';
const APP_ASSETS = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(request).then(response => {
      const path = new URL(request.url).pathname;
      if (response.ok && (path.startsWith('/static/') || path.startsWith('/icons/'))) {
        caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match(OFFLINE_URL);
      return new Response('', { status: 503, statusText: 'Offline' });
    })
  );
});