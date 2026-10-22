/**
 * LiveChat Service Worker
 * Ensures live data streaming and enforces a strict 1-hour maximum cache lifetime.
 * 
 * CACHING RULES:
 * - NEVER caches WebSockets, POST requests, chat messages, or private API data.
 * - Network-First for ALL requests (HTML, scripts, and images) to always serve live data.
 * - Cache fallback is strictly capped at 1 hour (3600 seconds). Any asset older than 1 hour is evicted.
 */

const CACHE_NAME = 'livechat-v2.0.0';
const MAX_CACHE_AGE_MS = 60 * 60 * 1000; // 1 hour (3600s)

// Baseline app shell for initial offline installability
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.webmanifest',
  '/offline.html',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/favicon-32.png',
  '/static/icons/icon.svg'
];

// Patterns that MUST NEVER be cached
const NEVER_CACHE_PATTERNS = [
  '/api/',
  '/ws/',
  '/ping',
  '/health',
  'reciever.php',
  'chatdatabase',
  'dicebear.com'
];

// Helper: attach timestamp header to cached response
function addTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cache-time', Date.now().toString());
  return response.blob().then((blob) => {
    return new Response(blob, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
  });
}

// Helper: check if a cached response has expired (> 1 hour old)
function isExpired(cachedResponse) {
  if (!cachedResponse) return true;
  const timeStr = cachedResponse.headers.get('sw-cache-time');
  if (!timeStr) return false; // precached item on first install
  const age = Date.now() - parseInt(timeStr, 10);
  return age > MAX_CACHE_AGE_MS;
}

// Install: precache baseline shell and skip waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
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

// Activate: purge obsolete caches and take immediate control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Evicting outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First with strict 1-hour expiration
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Never cache API, WebSockets, or live dynamic data
  const isExcluded = NEVER_CACHE_PATTERNS.some((pattern) => url.pathname.includes(pattern) || url.href.includes(pattern));
  if (isExcluded) {
    return; // Pass straight to live network
  }

  // 1. Navigation requests (HTML): Always Live Network First
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const stamped = await addTimestamp(networkResponse.clone());
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, stamped);
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline fallback
          const cached = await caches.match(request);
          if (cached && !isExpired(cached)) {
            return cached;
          }
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) {
            return offlinePage;
          }
          return new Response('You are offline. Active internet is required for real-time LiveChat.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        })
    );
    return;
  }

  // 2. Scripts, Styles, and Images: Network-First with max 1-hour cache TTL
  const isCacheableStatic =
    url.pathname.startsWith('/static/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.webmanifest');

  if (isCacheableStatic) {
    event.respondWith(
      fetch(request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            // Save to cache with timestamp
            const stamped = await addTimestamp(networkResponse.clone());
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, stamped);
          }
          return networkResponse;
        })
        .catch(async () => {
          // Network failed (offline) — use cache ONLY if less than 1 hour old
          const cached = await caches.match(request);
          if (cached) {
            if (!isExpired(cached)) {
              return cached;
            }
            // More than 1 hour old -> evict immediately!
            const cache = await caches.open(CACHE_NAME);
            cache.delete(request);
          }
          return new Response('Asset unavailable offline (>1 hour cache expired).', {
            status: 504,
            statusText: 'Gateway Timeout'
          });
        })
    );
    return;
  }

  // Default: Live network fetch
  event.respondWith(fetch(request));
});
