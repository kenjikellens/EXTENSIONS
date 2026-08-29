/**
 * @file injected.js
 * @description In-page hook injected into the webpage's main execution context.
 * Intercepts dynamically requested video streams, blobs, and manifest files.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__AVD_INJECTED__) return;
  window.__AVD_INJECTED__ = true;

  /**
   * Dispatches detected stream information to content script via postMessage.
   * @param {string} url - Media URL
   * @param {Object} [extra] - Additional metadata (resolution, type, etc.)
   */
  function notifyStream(url, extra = {}) {
    if (!url || typeof url !== 'string') return;

    try {
      const fullUrl = new URL(url, window.location.href).href;
      const cleanUrl = fullUrl.split('?')[0].toLowerCase();

      let streamType = null;
      if (cleanUrl.includes('.m3u8')) {
        streamType = 'hls';
      } else if (cleanUrl.includes('.mpd')) {
        streamType = 'dash';
      } else if (/\.(mp4|webm|mkv|ogg|mov|m4v|flv|avi)($|\?)/i.test(fullUrl)) {
        streamType = 'direct';
      } else if (fullUrl.startsWith('blob:')) {
        streamType = 'blob';
      }

      if (streamType) {
        window.postMessage(
          {
            source: 'AVD_INJECTED',
            url: fullUrl,
            type: streamType,
            title: document.title || 'Video Stream',
            ...extra
          },
          '*'
        );
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  /* --------------------------------------------------------------------------
     HOOK: window.fetch
     -------------------------------------------------------------------------- */
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const requestUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
      if (requestUrl) {
        notifyStream(requestUrl);
      }
    } catch {
      // Fail silently to avoid breaking page behavior
    }
    return originalFetch.apply(this, args);
  };

  /* --------------------------------------------------------------------------
     HOOK: XMLHttpRequest.prototype.open
     -------------------------------------------------------------------------- */
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      if (url) {
        notifyStream(url);
      }
    } catch {
      // Fail silently to avoid breaking page behavior
    }
    return originalOpen.apply(this, arguments);
  };
})();
