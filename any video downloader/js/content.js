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
   * Computes approximate FPS and clean resolution label from an HTMLVideoElement.
   * Affects stream registration payload sent to the background script.
   * @param {HTMLVideoElement} video - The target video element
   * @returns {{ resolution: string|null, fps: string|null }}
   */
  function getVideoMetrics(video) {
    let resolution = null;
    let fps = null;

    if (video.videoHeight) {
      const h = video.videoHeight;
      if (h >= 2160) resolution = '2160p (4K)';
      else if (h >= 1440) resolution = '1440p (2K)';
      else if (h >= 1080) resolution = '1080p';
      else if (h >= 720) resolution = '720p';
      else if (h >= 480) resolution = '480p';
      else if (h >= 360) resolution = '360p';
      else resolution = `${video.videoWidth}x${h}`;
    }

    if (typeof video.getVideoPlaybackQuality === 'function' && video.currentTime > 0.5) {
      const quality = video.getVideoPlaybackQuality();
      if (quality && quality.totalVideoFrames > 0) {
        const estFps = Math.round(quality.totalVideoFrames / video.currentTime);
        if (estFps >= 20 && estFps <= 144) {
          let snapped = estFps;
          if (Math.abs(estFps - 60) <= 4) snapped = 60;
          else if (Math.abs(estFps - 50) <= 2) snapped = 50;
          else if (Math.abs(estFps - 30) <= 3) snapped = 30;
          else if (Math.abs(estFps - 24) <= 2) snapped = 24;
          fps = `${snapped} fps`;
        }
      }
    }

    return { resolution, fps };
  }

  /**
   * Forwards a detected media stream to the extension background service worker.
   * Dispatches registered media stream event to the background script state.
   * @param {Object} streamData - Metadata { url, type, title, resolution, fps, source }
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
          fps: streamData.fps || null,
          source: streamData.source || 'dom'
        },
        title: document.title || 'Video Stream'
      });
    } catch {
      // Background worker might be waking up
    }
  }

  /**
   * Scans HTML5 video and source elements in the current document for media sources, resolution, and fps.
   * Discovers embedded page video elements and transmits stream records to the background service worker.
   */
  function scanDomVideoElements() {
    const videoElements = document.querySelectorAll('video');

    videoElements.forEach((video) => {
      const src = video.currentSrc || video.src;
      if (src) {
        const metrics = getVideoMetrics(video);
        sendStreamToBackground({
          url: src,
          resolution: metrics.resolution,
          fps: metrics.fps,
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
