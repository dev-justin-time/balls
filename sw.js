/**
 * Going Balls — Service Worker
 * Provides cache-busting for static assets on GitHub Pages.
 *
 * On each deploy, the CACHE_VERSION is stamped by CI with the git SHA,
 * so stale assets are never served.  The SW also enables offline play
 * for already-cached levels.
 */

const CACHE_VERSION = '__CACHE_VERSION__'; // replaced by CI on deploy
const CACHE_NAME = `going-balls-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './offline.html',
  './main.js',
  './engine/scene.js',
  './src/audio.js',
  './src/ball_db.js',
  './src/ball_index_ui.js',
  './src/levelgen.js',
  './src/networking.js',
  './src/notification_manager.js',
  './src/persistence.js',
  './src/physics.js',
  './src/rendering.js',
  './src/ui.js',
];

// Install — pre-cache critical shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — purge old versioned caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('going-balls-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — stale-while-revalidate for assets, network-first for navigation
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Navigation requests (HTML pages): network first, fallback to cache, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./offline.html')))
    );
    return;
  }

  // Asset requests: stale-while-revalidate
  // Serve from cache immediately, fetch in background to update cache for next visit
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => cached); // offline: fall back to cache if fetch fails

      // Return cached version immediately if available, otherwise wait for network
      return cached || fetchPromise;
    })
  );
});
