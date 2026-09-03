/**
 * @file helper-bridge.js
 * @description HTTP client bridge managing communication between browser extension and local Python helper daemon.
 */

export class HelperBridge {
  constructor(baseUrl = 'http://127.0.0.1:48921') {
    this.baseUrl = baseUrl;
  }

  /**
   * Pings the local helper to check if it is active.
   * If offline, attempts to auto-wake via Chrome Native Messaging and retries.
   * @param {boolean} [autoWake=true] - Whether to attempt auto-waking the helper
   * @returns {Promise<{online: boolean, ytdlp?: boolean, ffmpeg?: boolean}>}
   */
  async checkHealth(autoWake = true) {
    let health = await this._ping();
    if (health.online) {
      return health;
    }

    if (autoWake && typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        // Request background service worker to wake the Native Messaging host
        chrome.runtime.sendMessage({ action: 'ENSURE_HELPER' }).catch(() => {});
      } catch {
        // Ignore runtime errors
      }

      // Poll up to 6 times (1.5 seconds) for the headless server to bind port
      for (let i = 0; i < 6; i++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        health = await this._ping();
        if (health.online) {
          return health;
        }
      }
    }

    return { online: false };
  }

  /**
   * Sends a low-timeout HTTP ping to the helper daemon.
   * @private
   * @returns {Promise<{online: boolean, ytdlp?: boolean, ffmpeg?: boolean}>}
   */
  async _ping() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 800);

      const res = await fetch(`${this.baseUrl}/ping`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return { online: true, ...data };
      }
      return { online: false };
    } catch {
      return { online: false };
    }
  }

  /**
   * Fetches parsed format metadata (video resolutions, audio bitrates, subtitles) for a video URL.
   * @param {string} url - Target video URL
   * @param {number} [timeoutMs=15000] - Timeout in milliseconds
   * @returns {Promise<Object>}
   */
  async getVideoInfo(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/info?url=${encodeURIComponent(url)}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP fout ${res.status}`);
      }
      const json = await res.json();
      return json.data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Time-out bij ophalen van videoformaten (server reageerde niet binnen 15 seconden)');
      }
      throw err;
    }
  }

  /**
   * Triggers a download task on the local helper.
   * @param {Object} params - { url, type, height, abr, lang, title }
   * @returns {Promise<string>} Task ID
   */
  async startDownload(params) {
    const res = await fetch(`${this.baseUrl}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Kon download niet starten');
    }

    const json = await res.json();
    return json.taskId;
  }

  /**
   * Polls task download status until completion or failure.
   * @param {string} taskId - Task ID to track
   * @param {Function} onProgress - Progress callback ({ percent, speed, eta, filename })
   * @param {Function} onComplete - Completion callback ({ filename })
   * @param {Function} onError - Error callback (Error)
   * @returns {() => void} Function to stop polling
   */
  pollStatus(taskId, onProgress, onComplete, onError) {
    let stopped = false;

    const interval = setInterval(async () => {
      if (stopped) {
        clearInterval(interval);
        return;
      }

      try {
        const res = await fetch(`${this.baseUrl}/status?id=${encodeURIComponent(taskId)}`);
        if (!res.ok) return;

        const task = await res.json();
        if (task.status === 'downloading' || task.status === 'starting') {
          onProgress({
            percent: task.percent || 0,
            speed: task.speed || '',
            eta: task.eta || '',
            filename: task.filename || ''
          });
        } else if (task.status === 'completed') {
          stopped = true;
          clearInterval(interval);
          onComplete({ filename: task.filename || 'video.mp4' });
        } else if (task.status === 'error') {
          stopped = true;
          clearInterval(interval);
          onError(new Error(task.error || 'Download mislukt'));
        }
      } catch (err) {
        // Polling retry
      }
    }, 500);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }
}
