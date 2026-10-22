/**
 * LiveChat — Progressive Web App (PWA) Manager
 * Robust, cross-platform installation for Windows PC, Android, and mobile browsers.
 */

(function () {
  'use strict';

  // State variables
  let deferredPrompt = null;
  const DISMISS_KEY = 'livechat_pwa_dismissed_until';
  const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days polite cooldown

  // Platform detection helpers
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  const isMac = /Macintosh/i.test(ua);

  /**
   * Check if running in standalone (installed) mode
   */
  function isRunningStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  /**
   * Check if user dismissed the install banner recently
   */
  function isDismissed() {
    try {
      const until = localStorage.getItem(DISMISS_KEY);
      if (!until) return false;
      return Date.now() < parseInt(until, 10);
    } catch (e) {
      return false;
    }
  }

  /**
   * Record polite dismissal timestamp
   */
  function recordDismissal() {
    try {
      localStorage.setItem(DISMISS_KEY, (Date.now() + DISMISS_DURATION_MS).toString());
    } catch (e) {}
  }

  /**
   * Register Service Worker
   */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .then((registration) => {
            console.log('[PWA] Service Worker registered. Scope:', registration.scope);

            // Listen for waiting updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[PWA] New version ready.');
                  }
                });
              }
            });
          })
          .catch((error) => {
            console.warn('[PWA] Service Worker registration failed:', error);
          });
      });
    }
  }

  /**
   * Update UI element visibility based on installability state
   */
  function updateUI() {
    const standalone = isRunningStandalone();

    if (standalone) {
      document.documentElement.classList.add('pwa-standalone');
      hideAllInstallUI();
      return;
    }

    document.documentElement.classList.remove('pwa-standalone');

    // Show header icon button if available
    const headerBtn = document.getElementById('headerInstallBtn');
    const headerDivider = document.getElementById('headerInstallDivider');
    if (headerBtn) {
      headerBtn.style.display = 'inline-flex';
    }
    if (headerDivider) {
      headerDivider.style.display = 'block';
    }

    // Show profile modal button
    const profileBtn = document.getElementById('profileInstallBtn');
    if (profileBtn) {
      profileBtn.style.display = 'flex';
    }

    // Show auth overlay install button
    const authBtn = document.getElementById('authInstallBtn');
    if (authBtn) {
      authBtn.style.display = 'inline-flex';
    }

    // Show smart banner only if prompt is ready, not dismissed, and not standalone
    if (deferredPrompt && !isDismissed()) {
      showInstallBanner();
    }
  }

  function hideAllInstallUI() {
    const headerBtn = document.getElementById('headerInstallBtn');
    const headerDivider = document.getElementById('headerInstallDivider');
    const profileBtn = document.getElementById('profileInstallBtn');
    const authBtn = document.getElementById('authInstallBtn');
    const banner = document.getElementById('pwaInstallBanner');

    if (headerBtn) headerBtn.style.display = 'none';
    if (headerDivider) headerDivider.style.display = 'none';
    if (profileBtn) profileBtn.style.display = 'none';
    if (authBtn) authBtn.style.display = 'none';
    if (banner) banner.classList.remove('active');
  }

  function showInstallBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner && !isRunningStandalone()) {
      // Delay slightly for polite user experience
      setTimeout(() => {
        if (!isRunningStandalone() && !isDismissed()) {
          banner.classList.add('active');
        }
      }, 2200);
    }
  }

  function hideInstallBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) {
      banner.classList.remove('active');
    }
  }

  /**
   * Open the custom instructions modal for unsupported or native-disabled browsers
   */
  function showFallbackInstructions() {
    const modal = document.getElementById('pwaFallbackModal');
    if (!modal) return;

    // Platform-specific tabs/content
    const androidStep = document.getElementById('pwaStepAndroid');
    const windowsStep = document.getElementById('pwaStepWindows');
    const iosStep = document.getElementById('pwaStepIOS');

    if (androidStep) androidStep.style.display = 'none';
    if (windowsStep) windowsStep.style.display = 'none';
    if (iosStep) iosStep.style.display = 'none';

    if (isAndroid) {
      if (androidStep) androidStep.style.display = 'block';
    } else if (isIOS) {
      if (iosStep) iosStep.style.display = 'block';
    } else {
      // Windows / Desktop default
      if (windowsStep) windowsStep.style.display = 'block';
    }

    modal.style.display = 'flex';
  }

  function hideFallbackInstructions() {
    const modal = document.getElementById('pwaFallbackModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Primary Installation Trigger
   */
  async function triggerInstall() {
    if (isRunningStandalone()) {
      return;
    }

    if (deferredPrompt) {
      // Browser supports native beforeinstallprompt
      try {
        deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          console.log('[PWA] User accepted install prompt');
          hideAllInstallUI();
        } else {
          console.log('[PWA] User dismissed install prompt');
          recordDismissal();
          hideInstallBanner();
        }
        deferredPrompt = null;
      } catch (err) {
        console.warn('[PWA] Prompt error, falling back to instructions:', err);
        showFallbackInstructions();
      }
    } else {
      // Fallback instructions modal for browsers where prompt has already fired or is not supported
      showFallbackInstructions();
    }
  }

  /**
   * Setup Event Listeners
   */
  function init() {
    registerServiceWorker();

    // 1. Native beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent automatic mini-infobar or aggressive popup
      e.preventDefault();
      deferredPrompt = e;
      console.log('[PWA] beforeinstallprompt event captured');
      updateUI();
    });

    // 2. Native appinstalled event
    window.addEventListener('appinstalled', (evt) => {
      console.log('[PWA] LiveChat successfully installed as PWA');
      deferredPrompt = null;
      hideAllInstallUI();
      hideFallbackInstructions();

      // Show toast if app function exists
      if (typeof window.showToast === 'function') {
        window.showToast('LiveChat installed successfully! 🎉', 'success');
      }
    });

    // 3. Monitor standalone display changes
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      if (e.matches) {
        document.documentElement.classList.add('pwa-standalone');
        hideAllInstallUI();
      }
    });

    // 4. Attach click handlers to UI elements once DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
      updateUI();

      // Header button
      const headerBtn = document.getElementById('headerInstallBtn');
      if (headerBtn) {
        headerBtn.addEventListener('click', (e) => {
          e.preventDefault();
          triggerInstall();
        });
      }

      // Banner Install button
      const bannerInstallBtn = document.getElementById('pwaBannerInstallBtn');
      if (bannerInstallBtn) {
        bannerInstallBtn.addEventListener('click', (e) => {
          e.preventDefault();
          triggerInstall();
        });
      }

      // Banner Close / Dismiss button
      const bannerCloseBtn = document.getElementById('pwaBannerCloseBtn');
      if (bannerCloseBtn) {
        bannerCloseBtn.addEventListener('click', (e) => {
          e.preventDefault();
          recordDismissal();
          hideInstallBanner();
        });
      }

      // Profile settings modal button
      const profileBtn = document.getElementById('profileInstallBtn');
      if (profileBtn) {
        profileBtn.addEventListener('click', (e) => {
          e.preventDefault();
          // Close profile modal if open
          const profileModal = document.getElementById('profileModal');
          if (profileModal) profileModal.style.display = 'none';
          triggerInstall();
        });
      }

      // Auth overlay button
      const authBtn = document.getElementById('authInstallBtn');
      if (authBtn) {
        authBtn.addEventListener('click', (e) => {
          e.preventDefault();
          triggerInstall();
        });
      }

      // Fallback modal close buttons
      const fallbackClose = document.getElementById('pwaFallbackCloseBtn');
      const fallbackGotIt = document.getElementById('pwaFallbackGotItBtn');
      const fallbackModal = document.getElementById('pwaFallbackModal');

      if (fallbackClose) {
        fallbackClose.addEventListener('click', hideFallbackInstructions);
      }
      if (fallbackGotIt) {
        fallbackGotIt.addEventListener('click', hideFallbackInstructions);
      }
      if (fallbackModal) {
        fallbackModal.addEventListener('click', (e) => {
          if (e.target === fallbackModal) {
            hideFallbackInstructions();
          }
        });
      }
    });
  }

  // Run initialization
  init();

  // Export to window for external triggers
  window.LiveChatPWA = {
    triggerInstall,
    isRunningStandalone,
    showFallbackInstructions
  };
})();
