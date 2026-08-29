/**
 * @file content.js
 * @description Content script running in the webpage frame (isolated world).
 * Injects in-page sniffer hooks, scans DOM video elements, and communicates with background worker.
 */

(function () {
  'use strict';

  /**
   * Injects the main-world script for page-level fetch/XHR hooking.
   */
  function injectMainWorldHook() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('js/injected.js');
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch {
      // Ignore injection restrictions if any
    }
  }

  /**
   * Forwards a detected media stream to the extension background service worker.
   * @param {Object} streamData - Metadata { url, type, title, resolution, source }
   */
  function sendStreamToBackground(streamData) {
    if (!streamData || !streamData.url) return;

    try {
      chrome.runtime.sendMessage({
        action: 'REGISTER_STREAM',
        stream: {
          url: streamData.url,
          type: streamData.type,
          title: streamData.title || document.title || 'Video Stream',
          resolution: streamData.resolution || null,
          source: streamData.source || 'dom'
        },
        title: document.title || 'Video Stream'
      });
    } catch {
      // Background worker might be waking up
    }
  }

  /**
   * Scans HTML5 <video> and <source> elements in the current document.
   */
  function scanDomVideoElements() {
    const videoElements = document.querySelectorAll('video');

    videoElements.forEach((video) => {
      const src = video.currentSrc || video.src;
      if (src) {
        const resolution = video.videoWidth && video.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : null;
        sendStreamToBackground({
          url: src,
          resolution: resolution,
          source: 'video-element'
        });
      }

      video.querySelectorAll('source').forEach((source) => {
        if (source.src) {
          sendStreamToBackground({
            url: source.src,
            source: 'source-element'
          });
        }
      });
    });
  }

  // Listen for messages posted by the in-page hook (injected.js)
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'AVD_INJECTED') {
      return;
    }

    sendStreamToBackground({
      url: event.data.url,
      type: event.data.type,
      title: event.data.title || document.title,
      resolution: event.data.resolution,
      source: 'injected-hook'
    });
  });

  // Inject in-page hook
  injectMainWorldHook();

  // Initial scan & MutationObserver for dynamically added video players
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      scanDomVideoElements();
    });
  } else {
    scanDomVideoElements();
  }

  // Observe dynamically created <video> tags in SPA or lazy-loaded containers
  const observer = new MutationObserver(() => {
    scanDomVideoElements();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Periodic fallback scan
  setInterval(scanDomVideoElements, 3000);
})();
