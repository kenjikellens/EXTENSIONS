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
   * @returns {Promise<{online: boolean, ytdlp?: boolean, ffmpeg?: boolean}>}
   */
  async checkHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

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
   * @returns {Promise<Object>}
   */
  async getVideoInfo(url) {
    const res = await fetch(`${this.baseUrl}/info?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP fout ${res.status}`);
    }
    const json = await res.json();
    return json.data;
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
