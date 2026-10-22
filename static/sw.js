/**
 * LiveChat Service Worker
 * Provides PWA installability, safe app shell caching, and graceful offline fallback.
 * 
 * SECURITY & PRIVACY:
 * - NEVER caches WebSocket, POST requests, or sensitive authentication/chat API endpoints.
 * - Network-First for HTML navigation to ensure users always receive the latest deployment.
 * - Stale-While-Revalidate for static visual assets (CSS, JS, fonts, icons).
 */

const CACHE_NAME = 'livechat-shell-v1.0.0';

// Essential assets for the standalone shell
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.webmanifest',
  '/offline.html',
  '/static/style.css?v=22.0',
  '/static/app.js?v=22.0',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/icon-192-maskable.png',
  '/static/icons/icon-512-maskable.png',
  '/static/icons/favicon-32.png',
  '/static/icons/icon.svg'
];

// Paths that must NEVER be cached by the service worker
const EXCLUDED_PATTERNS = [
  '/api/',
  '/ws/',
  '/ping',
  '/health',
  'reciever.php',
  'chatdatabase'
];

// Install: precache app shell and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use cache.addAll with individual catch so an optional asset failure doesn't break install
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Precache skipped for:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: purge outdated caches and take control of all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting obsolete cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: intelligent strategy with zero security/data pollution
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Ignore non-http/https schemes (e.g. chrome-extension:)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Never cache API, WebSockets, or external PHP storage requests
  const isExcluded = EXCLUDED_PATTERNS.some((pattern) => url.pathname.includes(pattern) || url.href.includes(pattern));
  if (isExcluded) {
    return; // Pass straight to network
  }

  // 1. Navigation requests (HTML pages): Network-First with offline.html fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // If network returns valid response, update cache for root
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline fallback
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) {
            return offlinePage;
          }
          return new Response('You are offline. Please check your internet connection.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        })
    );
    return;
  }

  // 2. Static shell assets (CSS, JS, Fonts, Icons): Stale-While-Revalidate
  const isStaticAsset =
    url.pathname.startsWith('/static/') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.webmanifest') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
