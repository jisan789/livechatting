/**
 * LiveChat Service Worker — ZERO-CACHE POLICY
 * 
 * Strict live data policy:
 * - NO caching of scripts, styles, HTML, images, or API data.
 * - Cache lifetime is ZERO (0 seconds).
 * - All fetches go directly to live network with no-store.
 * - Any obsolete caches are permanently deleted.
 */

const CACHE_VERSION = 'livechat-zero-cache-v1';

// Install immediately without caching anything
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: permanently purge ALL existing caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          console.log('[SW] Purging cache completely:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Always serve direct live data from network — ZERO caching
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignore non-http(s) schemes (e.g. extensions)
  if (!request.url.startsWith('http')) {
    return;
  }

  // Always fetch live from network with zero caching
  event.respondWith(
    fetch(request).catch(() => {
      if (request.mode === 'navigate') {
        return new Response(
          '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Offline</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#F1F5F9;color:#0F172A;text-align:center;padding:20px;}</style></head><body><div><h2>Offline</h2><p>LiveChat requires an active internet connection to deliver real-time data.</p><button onclick="window.location.reload()" style="padding:10px 18px;border-radius:12px;background:#7C3AED;color:#FFF;border:none;cursor:pointer;font-weight:600;">Reconnect</button></div></body></html>',
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
              'Pragma': 'no-cache',
              'Expires': '0'
            })
          }
        );
      }
      return new Response('Network unavailable (Zero-Cache Mode)', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        })
      });
    })
  );
});
