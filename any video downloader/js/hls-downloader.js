/**
 * @file hls-downloader.js
 * @description Ultra-high performance HLS (.m3u8) parser, decryptor, and adaptive segment merger engine.
 * Features 3-variable dynamic concurrency (CPU cores x Network bandwidth x Server throughput),
 * AIMD congestion control, micro-pacing, anti-IP-ban circuit breaker, and real-time speed tracking.
 */

/**
 * Tracks real-time network throughput and computes moving average download speeds and ETA.
 */
export class StreamMetricsTracker {
  /**
   * Initializes the throughput metrics tracker with default baseline values.
   */
  constructor() {
    this.totalBytes = 0;
    this.startTime = Date.now();
    this.ewmaSpeed = 0; // Bytes per second
    this.alpha = 0.3; // EWMA smoothing factor
    this.lastSampleTime = Date.now();
    this.bytesSinceLastSample = 0;
  }

  /**
   * Records a downloaded segment size and updates the Exponentially Weighted Moving Average speed.
   * @param {number} bytes - Number of bytes received in the completed segment
   */
  recordChunk(bytes) {
    this.totalBytes += bytes;
    this.bytesSinceLastSample += bytes;

    const now = Date.now();
    const elapsed = (now - this.lastSampleTime) / 1000;

    if (elapsed >= 0.5) {
      const instantSpeed = this.bytesSinceLastSample / elapsed;
      if (this.ewmaSpeed === 0) {
        this.ewmaSpeed = instantSpeed;
      } else {
        this.ewmaSpeed = this.alpha * instantSpeed + (1 - this.alpha) * this.ewmaSpeed;
      }
      this.lastSampleTime = now;
      this.bytesSinceLastSample = 0;
    }
  }

  /**
   * Returns formatted human-readable speed string (e.g. '4.8 MB/s').
   * @returns {string} Formatted speed string
   */
  getFormattedSpeed() {
    const bps = this.ewmaSpeed || (this.totalBytes / Math.max((Date.now() - this.startTime) / 1000, 0.1));
    if (bps >= 1024 * 1024) {
      return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (bps >= 1024) {
      return `${(bps / 1024).toFixed(0)} KB/s`;
    }
    return `${bps.toFixed(0)} B/s`;
  }

  /**
   * Estimates remaining download time based on completed vs total segments and current speed.
   * @param {number} completed - Number of completed segments
   * @param {number} total - Total segments count
   * @returns {string} Human-readable ETA (e.g. '12s' or '1m 20s')
   */
  getEstimatedEta(completed, total) {
    if (completed <= 0 || total <= 0 || completed >= total) return '0s';
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = completed / elapsed; // Segments per second
    if (rate <= 0) return '--';
    const remainingSeconds = Math.ceil((total - completed) / rate);

    if (remainingSeconds < 60) {
      return `${remainingSeconds}s`;
    }
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return `${mins}m ${secs}s`;
  }
}

/**
 * Manages dynamic concurrency window, Slow-Start scaling, and Anti-Ban backoff.
 */
export class AdaptiveConcurrencyController {
  /**
   * Initializes hardware limits, initial slow-start window, and congestion thresholds.
   */
  constructor() {
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    // Hard ceiling: min(cores * 2, 32), with safe minimum 6
    this.maxHardwareCeiling = Math.min(Math.max(cores * 2, 6), 32);
    this.currentConcurrency = 4; // Start safe with slow-start
    this.lastScaleTime = Date.now();
    this.consecutiveSuccesses = 0;
    this.inBackoffCooldown = false;
    this.lastSpeedSample = 0;
  }

  /**
   * Returns the current allowed number of parallel workers.
   * @returns {number} Active concurrency limit
   */
  getConcurrency() {
    return this.currentConcurrency;
  }

  /**
   * Evaluates chunk completion metrics and scales concurrency up or stabilizes.
   * @param {number} durationMs - Segment download duration in milliseconds
   * @param {number} currentSpeedBps - Current measured EWMA speed in bytes per second
   */
  onSegmentSuccess(durationMs, currentSpeedBps) {
    if (this.inBackoffCooldown) return;

    this.consecutiveSuccesses++;
    const now = Date.now();

    // Scale up condition: 4 consecutive fast segments and at least 600ms since last scale
    if (this.consecutiveSuccesses >= 4 && now - this.lastScaleTime > 600) {
      if (this.currentConcurrency < this.maxHardwareCeiling) {
        // Only scale up if latency is healthy (< 1500ms)
        if (durationMs < 1500) {
          const speedGain = (currentSpeedBps - this.lastSpeedSample) / Math.max(this.lastSpeedSample, 1);
          // If we haven't saturated network or are still in slow-start
          if (this.lastSpeedSample === 0 || speedGain > 0.05 || this.currentConcurrency < 8) {
            this.currentConcurrency = Math.min(this.currentConcurrency + 2, this.maxHardwareCeiling);
            this.lastScaleTime = now;
            this.lastSpeedSample = currentSpeedBps;
            this.consecutiveSuccesses = 0;
          }
        }
      }
    }
  }

  /**
   * Halves concurrency and triggers cooldown backoff when rate-limiting or latency spikes occur.
   */
  triggerBackoff() {
    this.currentConcurrency = Math.max(Math.floor(this.currentConcurrency * 0.5), 4);
    this.inBackoffCooldown = true;
    this.consecutiveSuccesses = 0;
    this.lastScaleTime = Date.now();

    setTimeout(() => {
      this.inBackoffCooldown = false;
    }, 800);
  }

  /**
   * Computes a micro-pacing delay (15-30ms) to prevent server-side burst/DDoS detection.
   * @returns {number} Milliseconds to delay before sending next segment request
   */
  getPacingDelay() {
    return 15 + Math.floor(Math.random() * 15);
  }
}

/**
 * Main HLS Downloader Engine implementing adaptive multi-worker streaming downloads.
 */
export class HLSDownloaderEngine {
  /**
   * Fetches text content from a remote URL with high priority.
   * @param {string} url - Target URL
   * @returns {Promise<string>} Manifest or playlist text
   */
  static async fetchText(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(`HTTP fout ${res.status} bij ophalen playlist: ${url}`);
    }
    return await res.text();
  }

  /**
   * Fetches binary content from a remote URL as an ArrayBuffer with connection prioritization.
   * @param {string} url - Target segment URL
   * @param {AbortSignal} [signal] - Optional abort signal
   * @returns {Promise<{buffer: ArrayBuffer, durationMs: number, status: number}>}
   */
  static async fetchBuffer(url, signal) {
    const startTime = Date.now();
    const res = await fetch(url, {
      priority: 'high',
      cache: 'no-cache',
      signal: signal
    });

    if (!res.ok) {
      throw new Error(`HTTP fout ${res.status}`);
    }

    const buffer = await res.arrayBuffer();
    const durationMs = Math.max(Date.now() - startTime, 1);
    return { buffer, durationMs, status: res.status };
  }

  /**
   * Parses an HLS Master Playlist into available quality variants.
   * @param {string} masterUrl - Master M3U8 URL
   * @returns {Promise<Array<{url: string, resolution?: string, bandwidth?: number}>>}
   */
  static async parseMasterPlaylist(masterUrl) {
    const content = await this.fetchText(masterUrl);
    const lines = content.split(/\r?\n/);
    const variants = [];
    let currentVariant = null;

    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        currentVariant = {};
        const resMatch = line.match(/RESOLUTION=(\d+x\d+)/i);
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        if (resMatch) currentVariant.resolution = resMatch[1];
        if (bwMatch) currentVariant.bandwidth = parseInt(bwMatch[1], 10);
      } else if (line && !line.startsWith('#') && currentVariant) {
        currentVariant.url = new URL(line, masterUrl).href;
        variants.push(currentVariant);
        currentVariant = null;
      }
    }

    return variants;
  }

  /**
   * Parses an HLS Media Playlist into segment URLs, encryption keys, and init segments.
   * @param {string} mediaUrl - Media M3U8 URL
   * @returns {Promise<{segments: string[], keyInfo: Object|null, initSegmentUrl: string|null}>}
   */
  static async parseMediaPlaylist(mediaUrl) {
    const content = await this.fetchText(mediaUrl);
    const lines = content.split(/\r?\n/);
    const segments = [];
    let keyInfo = null;
    let initSegmentUrl = null;

    for (let line of lines) {
      line = line.trim();

      // Detect AES-128 Encryption Key
      if (line.startsWith('#EXT-X-KEY:')) {
        const methodMatch = line.match(/METHOD=([^,\s]+)/);
        const uriMatch = line.match(/URI="([^"]+)"/);
        const ivMatch = line.match(/IV=0x([0-9a-fA-F]+)/);

        if (methodMatch && methodMatch[1] === 'AES-128' && uriMatch) {
          keyInfo = {
            method: 'AES-128',
            keyUrl: new URL(uriMatch[1], mediaUrl).href,
            iv: ivMatch ? this._hexToUint8Array(ivMatch[1]) : null
          };
        }
      }

      // Detect fMP4 Initialization Segment
      if (line.startsWith('#EXT-X-MAP:')) {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch) {
          initSegmentUrl = new URL(uriMatch[1], mediaUrl).href;
        }
      }

      // Segment URL line
      if (line && !line.startsWith('#')) {
        segments.push(new URL(line, mediaUrl).href);
      }
    }

    return { segments, keyInfo, initSegmentUrl };
  }

  /**
   * Converts a hexadecimal string to a Uint8Array.
   * @param {string} hex - Hexadecimal string
   * @returns {Uint8Array}
   */
  static _hexToUint8Array(hex) {
    const clean = hex.length % 2 !== 0 ? '0' + hex : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }
    return bytes;
  }

  /**
   * Downloads and decrypts all HLS segments using the adaptive concurrency engine and merges into a video file.
   * @param {string} mediaUrl - M3U8 Playlist URL
   * @param {string} filename - Desired output filename
   * @param {Function} progressCb - Progress update callback ({ status, percent, speed, workers })
   * @param {AbortSignal} [abortSignal] - Signal to cancel the download
   * @returns {Promise<void>}
   */
  static async downloadAndMergeHLS(mediaUrl, filename, progressCb, abortSignal) {
    progressCb({ status: 'Playlist inlezen...', percent: 0, speed: '' });

    // 1. Check if Master Playlist
    let targetPlaylistUrl = mediaUrl;
    try {
      const variants = await this.parseMasterPlaylist(mediaUrl);
      if (variants.length > 0) {
        variants.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
        targetPlaylistUrl = variants[0].url;
      }
    } catch {
      // Direct media playlist
    }

    // 2. Parse media playlist
    const { segments, keyInfo, initSegmentUrl } = await this.parseMediaPlaylist(targetPlaylistUrl);
    if (!segments.length) {
      throw new Error('Geen video-segmenten gevonden in deze stream playlist.');
    }

    // 3. Fetch AES Decryption Key if needed
    let cryptoKey = null;
    if (keyInfo) {
      progressCb({ status: 'Decryptiesleutel ophalen...', percent: 2, speed: '' });
      const { buffer: rawKey } = await this.fetchBuffer(keyInfo.keyUrl, abortSignal);
      cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['decrypt']);
    }

    const downloadedChunks = [];
    const total = segments.length + (initSegmentUrl ? 1 : 0);
    let completed = 0;

    const metrics = new StreamMetricsTracker();
    const controller = new AdaptiveConcurrencyController();

    // 4. Download Init Segment (for fMP4 streams)
    if (initSegmentUrl) {
      const { buffer: initBuf } = await this.fetchBuffer(initSegmentUrl, abortSignal);
      downloadedChunks.push(initBuf);
      metrics.recordChunk(initBuf.byteLength);
      completed++;
    }

    // 5. Dynamic Adaptive Worker Pool
    const queue = segments.map((url, idx) => ({ index: idx, url: url }));
    let activeWorkers = 0;
    let lastUiUpdate = 0;

    const triggerUiUpdate = () => {
      const now = Date.now();
      if (now - lastUiUpdate >= 100 || completed >= total) {
        lastUiUpdate = now;
        const percent = Math.min(Math.floor((completed / total) * 98), 98);
        const speedText = metrics.getFormattedSpeed();
        const etaText = metrics.getEstimatedEta(completed, total);
        const currentWorkers = controller.getConcurrency();

        progressCb({
          status: `Segmenten: ${completed} / ${total}`,
          percent: percent,
          speed: `${speedText} • ${currentWorkers} workers • ETA ${etaText}`
        });
      }
    };

    const processNext = async () => {
      if (abortSignal && abortSignal.aborted) {
        throw new Error('Download geannuleerd door gebruiker.');
      }

      if (queue.length === 0) return;
      const item = queue.shift();
      activeWorkers++;

      const pacingDelay = controller.getPacingDelay();
      if (pacingDelay > 0) {
        await new Promise((r) => setTimeout(r, pacingDelay));
      }

      let rawChunk = null;
      let duration = 0;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        if (abortSignal && abortSignal.aborted) {
          throw new Error('Download geannuleerd door gebruiker.');
        }

        try {
          const res = await this.fetchBuffer(item.url, abortSignal);
          rawChunk = res.buffer;
          duration = res.durationMs;
          controller.onSegmentSuccess(duration, metrics.ewmaSpeed);
          break;
        } catch (err) {
          attempts++;
          controller.triggerBackoff();
          if (attempts >= maxAttempts) {
            throw new Error(`Kon segment ${item.index + 1} niet ophalen: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, 400 * attempts));
        }
      }

      // Decrypt if AES encrypted
      if (cryptoKey && rawChunk) {
        let iv = keyInfo.iv;
        if (!iv) {
          iv = new Uint8Array(16);
          new DataView(iv.buffer).setUint32(12, item.index + 1, false);
        }
        rawChunk = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, cryptoKey, rawChunk);
      }

      downloadedChunks[item.index + (initSegmentUrl ? 1 : 0)] = rawChunk;
      metrics.recordChunk(rawChunk.byteLength);
      completed++;
      activeWorkers--;

      triggerUiUpdate();
    };

    // Main Adaptive Dispatch Loop
    await new Promise((resolve, reject) => {
      const runner = async () => {
        try {
          while (queue.length > 0 || activeWorkers > 0) {
            if (abortSignal && abortSignal.aborted) {
              return reject(new Error('Download geannuleerd door gebruiker.'));
            }

            const targetConcurrency = controller.getConcurrency();
            while (activeWorkers < targetConcurrency && queue.length > 0) {
              processNext().catch((err) => reject(err));
            }

            await new Promise((r) => setTimeout(r, 20));
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      runner();
    });

    // 6. Merge Chunks and Save
    progressCb({ status: 'Bestand samenvoegen en opslaan...', percent: 99, speed: '' });
    const isFmp4 = Boolean(initSegmentUrl);
    const mimeType = isFmp4 ? 'video/mp4' : 'video/mp2t';
    const finalBlob = new Blob(downloadedChunks, { type: mimeType });

    const cleanFilename = filename.endsWith('.ts') || filename.endsWith('.mp4')
      ? filename
      : `${filename}${isFmp4 ? '.mp4' : '.ts'}`;

    await this.saveBlob(finalBlob, cleanFilename);
    progressCb({ status: 'Download voltooid!', percent: 100, speed: '' });
  }

  /**
   * Saves a Blob to the user's Downloads directory via browser Downloads API or anchor fallback.
   * @param {Blob} blob - Binary video blob
   * @param {string} filename - Target filename
   * @returns {Promise<void>}
   */
  static saveBlob(blob, filename) {
    return new Promise((resolve) => {
      const blobUrl = URL.createObjectURL(blob);

      if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
        chrome.downloads.download(
          {
            url: blobUrl,
            filename: filename,
            saveAs: true
          },
          () => {
            setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
            resolve();
          }
        );
      } else {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
        resolve();
      }
    });
  }
}
