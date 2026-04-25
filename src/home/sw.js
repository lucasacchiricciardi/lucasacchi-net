const CACHE_NAME = 'lsn-v1';
const BASE_PATH = location.pathname.replace(/\/[^/]*$/, '') || '';
const ASSETS_TO_CACHE = [
  BASE_PATH + '/',
  BASE_PATH + '/index.html',
  BASE_PATH + '/main.js',
  BASE_PATH + '/newsWorker.js',
  BASE_PATH + '/sw.js',
  BASE_PATH + '/favicon.svg',
  BASE_PATH + '/manifest.json',
  BASE_PATH + '/news/news-feed.json',
  BASE_PATH + '/version.txt',
  BASE_PATH + '/robots.txt',
  BASE_PATH + '/sitemap.xml'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(function(url) {
          return fetch(url).then(function(response) {
            if (response.ok) {
              cache.put(url, response);
            }
          }).catch(function() {});
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        var responseClone = response.clone();
        if (response.status === 200) {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(function() {
        return caches.match(event.request).then(function(response) {
          return response || caches.match(BASE_PATH + '/');
        });
      })
  );
});
