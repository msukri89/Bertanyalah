const CACHE_NAME = 'turath-ai-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install Service Worker dan simpan file ke cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Membuka cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercept request jaringan (Fetch)
self.addEventListener('fetch', (event) => {
  // Hanya intercept request GET, abaikan POST (seperti ke Webhook Make.com)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Kembalikan file dari cache jika ada, jika tidak lakukan fetch dari jaringan
        return response || fetch(event.request);
      })
  );
});

// Bersihkan cache lama jika ada pembaruan versi
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
