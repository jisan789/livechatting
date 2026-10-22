/**
 * LiveChat — Progressive Web App (PWA) Registration
 * Enables native browser and phone installation in default browser settings
 * without displaying custom in-chat install buttons, banners, or instruction overlays.
 */

(function () {
  'use strict';

  // Detect standalone mode
  function isRunningStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  if (isRunningStandalone()) {
    document.documentElement.classList.add('pwa-standalone');
  }

  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    if (e.matches) {
      document.documentElement.classList.add('pwa-standalone');
    }
  });

  // Register Service Worker for PWA installability & offline fallback
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered. Scope:', reg.scope);

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] New version available.');
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration error:', err);
        });
    });
  }

  window.LiveChatPWA = {
    isRunningStandalone
  };
})();
