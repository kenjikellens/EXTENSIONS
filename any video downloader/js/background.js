/**
 * @file background.js
 * @description Background Service Worker for Any Video Downloader extension (Manifest V3).
 * Intercepts network requests, maintains per-tab stream registries, and handles browser-level downloads.
 */

// Central store for streams: Map<tabId, Map<url, StreamInfo>>
const tabStreamsMap = new Map();

// Map of tabId -> active page title
const tabTitlesMap = new Map();

/**
 * Filter checks if a URL is analytics, ads, or irrelevant telemetry.
 * @param {string} url - Request URL to inspect
 * @returns {boolean} True if URL should be ignored
 */
function isIgnoredUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase();
  
  // Exclude known analytics, telemetry, and tracking endpoints
  if (
    lower.includes('google-analytics') ||
    lower.includes('doubleclick') ||
    lower.includes('/telemetry') ||
    lower.includes('/beacon') ||
    lower.includes('/log_event') ||
    lower.includes('googlesyndication') ||
    lower.includes('adnxs.com') ||
    lower.includes('scorecardresearch')
  ) {
    return true;
  }

  // Exclude individual segment files unless specifically part of master flow
  // (e.g. avoid cluttering list with 500 individual .ts/.m4s chunks when .m3u8/.mpd is present)
  if (
    (lower.endsWith('.ts') && !lower.includes('master') && !lower.includes('playlist')) ||
    (lower.endsWith('.m4s') && !lower.includes('master'))
  ) {
    return true;
  }

  return false;
}

/**
 * Classifies a URL into a stream type.
 * @param {string} url - URL to classify
 * @param {string} [contentType] - Optional HTTP Content-Type header
 * @returns {string|null} 'hls' | 'dash' | 'direct' | 'blob' | null
 */
function classifyStreamType(url, contentType = '') {
  const cleanUrl = url.split('?')[0].toLowerCase();
  const mime = (contentType || '').toLowerCase();

  if (cleanUrl.includes('.m3u8') || mime.includes('application/vnd.apple.mpegurl') || mime.includes('application/x-mpegurl')) {
    return 'hls';
  }
  if (cleanUrl.includes('.mpd') || mime.includes('application/dash+xml')) {
    return 'dash';
  }
  if (
    /\.(mp4|webm|mkv|ogg|mov|m4v|flv|avi)($|\?)/i.test(url) ||
    mime.startsWith('video/') ||
    mime.includes('video/mp4') ||
    mime.includes('video/webm')
  ) {
    return 'direct';
  }
  if (url.startsWith('blob:')) {
    return 'blob';
  }

  return null;
}

/**
 * Extracts a normalized file extension or container label from a URL and stream type.
 * Affects the extension badge metadata stored in tab stream records.
 * @param {string} url - Stream target URL
 * @param {string} type - Classify stream type ('hls' | 'dash' | 'direct' | 'blob')
 * @returns {string} File extension label (e.g. 'mp4', 'm3u8', 'mpd')
 */
function detectStreamExtension(url, type) {
  try {
    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
    const match = cleanUrl.match(/\.(mp4|m3u8|mpd|webm|mkv|mov|m4v|flv|ts|m4s)($|\/)/i);
    if (match) {
      return match[1];
    }
  } catch {
    // Ignore URL parsing errors
  }

  if (type === 'hls') return 'm3u8';
  if (type === 'dash') return 'mpd';
  if (type === 'direct') return 'mp4';
  if (type === 'blob') return 'blob';
  return 'mp4';
}

/**
 * Registers a detected stream for a given tab ID and updates the toolbar badge.
 * Updates the in-memory tabStreamsMap and triggers an action badge re-render.
 * @param {number} tabId - Browser tab ID
 * @param {Object} streamData - Stream metadata { url, type, title, resolution, fps, codec, format, source }
 */
function registerStream(tabId, streamData) {
  if (!tabId || tabId < 0 || !streamData.url) return;
  if (isIgnoredUrl(streamData.url)) return;

  const type = streamData.type || classifyStreamType(streamData.url, streamData.contentType);
  if (!type) return;

  if (!tabStreamsMap.has(tabId)) {
    tabStreamsMap.set(tabId, new Map());
  }

  const streams = tabStreamsMap.get(tabId);
  if (streams.has(streamData.url)) {
    // Update existing stream with newer metadata if available (e.g. resolution or fps)
    const existing = streams.get(streamData.url);
    if (streamData.resolution && (!existing.resolution || existing.resolution.includes('x'))) {
      existing.resolution = streamData.resolution;
    }
    if (streamData.fps && !existing.fps) {
      existing.fps = streamData.fps;
    }
    return;
  }

  const pageTitle = tabTitlesMap.get(tabId) || 'Video Stream';
  const cleanTitle = (streamData.title && streamData.title !== 'Video') ? streamData.title : pageTitle;

  const streamInfo = {
    id: `stream_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    url: streamData.url,
    type: type,
    title: cleanTitle,
    resolution: streamData.resolution || null,
    fps: streamData.fps || null,
    codec: streamData.codec || null,
    ext: detectStreamExtension(streamData.url, type),
    bitrate: streamData.bitrate || null,
    source: streamData.source || 'network',
    detectedAt: Date.now()
  };

  streams.set(streamData.url, streamInfo);
  updateTabBadge(tabId);
}

/**
 * Updates the extension action icon badge count and color for a specific tab.
 * @param {number} tabId - Browser tab ID
 */
function updateTabBadge(tabId) {
  const streams = tabStreamsMap.get(tabId);
  const count = streams ? streams.size : 0;

  chrome.action.setBadgeText({
    tabId: tabId,
    text: count > 0 ? String(count) : ''
  });

  chrome.action.setBadgeBackgroundColor({
    tabId: tabId,
    color: '#2563eb'
  });
}

/* ==========================================================================
   NETWORK SNIFFER HOOKS (chrome.webRequest)
   ========================================================================== */

/**
 * Sniffs all outgoing requests before they are sent.
 */
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Only capture requests from valid tabs
    if (details.tabId < 0) return;

    const url = details.url;
    if (isIgnoredUrl(url)) return;

    const type = classifyStreamType(url);
    if (type) {
      registerStream(details.tabId, {
        url: url,
        type: type,
        source: 'webRequest'
      });
    }
  },
  { urls: ['<all_urls>'] }
);

/**
 * Sniffs response headers for video MIME types that might have dynamic URLs.
 */
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const url = details.url;
    if (isIgnoredUrl(url)) return;

    let contentType = '';
    if (details.responseHeaders) {
      const header = details.responseHeaders.find(
        (h) => h.name.toLowerCase() === 'content-type'
      );
      if (header && header.value) {
        contentType = header.value;
      }
    }

    const type = classifyStreamType(url, contentType);
    if (type) {
      registerStream(details.tabId, {
        url: url,
        type: type,
        contentType: contentType,
        source: 'webRequest-headers'
      });
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

/* ==========================================================================
   TAB LIFECYCLE LISTENERS
   ========================================================================== */

// Clean up memory when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStreamsMap.delete(tabId);
  tabTitlesMap.delete(tabId);
});

// Update title or reset streams when navigating to a new URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab && tab.title) {
    tabTitlesMap.set(tabId, tab.title);
  }

  // If user navigates to a new webpage, clear old streams for that tab
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabStreamsMap.delete(tabId);
    updateTabBadge(tabId);
  }
});

/* ==========================================================================
   INTER-PROCESS COMMUNICATION (IPC)
   ========================================================================== */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId || (sender.tab ? sender.tab.id : null);

  switch (message.action) {
    case 'GET_TAB_STREAMS': {
      const targetTabId = message.tabId;
      const streams = tabStreamsMap.get(targetTabId);
      const streamList = streams ? Array.from(streams.values()) : [];
      const tabTitle = tabTitlesMap.get(targetTabId) || '';
      sendResponse({ success: true, streams: streamList, title: tabTitle });
      break;
    }

    case 'REGISTER_STREAM': {
      if (tabId) {
        if (message.title && !tabTitlesMap.has(tabId)) {
          tabTitlesMap.set(tabId, message.title);
        }
        registerStream(tabId, message.stream);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No tabId found' });
      }
      break;
    }

    case 'CLEAR_TAB_STREAMS': {
      if (message.tabId) {
        tabStreamsMap.delete(message.tabId);
        updateTabBadge(message.tabId);
        sendResponse({ success: true });
      }
      break;
    }

    case 'DOWNLOAD_DIRECT': {
      chrome.downloads.download(
        {
          url: message.url,
          filename: message.filename || 'video.mp4',
          saveAs: true
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true, downloadId: downloadId });
          }
        }
      );
      return true; // Keep message channel open for async response
    }

    case 'ENSURE_HELPER': {
      ensureNativeHelper();
      sendResponse({ success: true });
      break;
    }

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }

  return true;
});

// Native Messaging Host Controller
let nativePort = null;

/**
 * Ensures Native Messaging Host connection is active.
 * Chrome launches AnyVideoDownloaderHelper in headless mode in the background.
 * Exits cleanly when the browser closes.
 * @returns {chrome.runtime.Port|null}
 */
function ensureNativeHelper() {
  if (nativePort) return nativePort;
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connectNative) return null;
  try {
    nativePort = chrome.runtime.connectNative('com.kenjigames.any_video_downloader');
    nativePort.onMessage.addListener(() => {
      // Received response from native helper
    });
    nativePort.onDisconnect.addListener(() => {
      // Consume lastError to prevent Chromium Unchecked runtime.lastError logs
      const err = chrome.runtime.lastError;
      if (err) {
        // Disconnected or stopped cleanly
      }
      nativePort = null;
    });
    nativePort.postMessage({ action: 'ping' });
    return nativePort;
  } catch {
    nativePort = null;
    return null;
  }
}

// Auto-connect when visiting YouTube or upon browser startup
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onStartup?.addListener(() => {
    ensureNativeHelper();
  });

  chrome.runtime.onInstalled?.addListener(() => {
    ensureNativeHelper();
  });
}

if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab?.url && (tab.url.includes('youtube.com') || tab.url.includes('youtu.be'))) {
      ensureNativeHelper();
    }
  });
}
