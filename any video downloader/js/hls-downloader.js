/**
 * @file hls-downloader.js
 * @description High-performance HLS (.m3u8) parser, decryptor, and segment merger engine.
 * Handles Master playlist parsing, AES-128 decryption, fMP4 init segments, and concurrent downloads.
 */

export class HLSDownloaderEngine {
  /**
   * Fetches text content from a URL (e.g. playlist or manifest).
   * @param {string} url - Target URL
   * @returns {Promise<string>}
   */
  static async fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status} when fetching: ${url}`);
    }
    return await res.text();
  }

  /**
   * Fetches binary content from a URL as an ArrayBuffer.
   * @param {string} url - Target URL
   * @returns {Promise<ArrayBuffer>}
   */
  static async fetchBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status} when fetching segment: ${url}`);
    }
    return await res.arrayBuffer();
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
   * Downloads and decrypts all HLS segments concurrently, merging them into a single output file.
   * @param {string} mediaUrl - M3U8 Playlist URL
   * @param {string} filename - Desired output filename
   * @param {Function} progressCb - Progress update callback ({ status, percent })
   * @param {AbortSignal} [abortSignal] - Signal to cancel the download
   */
  static async downloadAndMergeHLS(mediaUrl, filename, progressCb, abortSignal) {
    progressCb({ status: 'Playlist inlezen...', percent: 0 });

    // 1. Check if Master Playlist
    let targetPlaylistUrl = mediaUrl;
    try {
      const variants = await this.parseMasterPlaylist(mediaUrl);
      if (variants.length > 0) {
        // Sort highest bandwidth first by default
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
      progressCb({ status: 'Decryptiesleutel ophalen...', percent: 2 });
      const rawKey = await this.fetchBuffer(keyInfo.keyUrl);
      cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['decrypt']);
    }

    const downloadedChunks = [];
    const total = segments.length + (initSegmentUrl ? 1 : 0);
    let completed = 0;

    // 4. Download Init Segment (for fMP4 streams)
    if (initSegmentUrl) {
      const initBuf = await this.fetchBuffer(initSegmentUrl);
      downloadedChunks.push(initBuf);
      completed++;
    }

    // 5. Parallel download pool (concurrency = 4)
    const concurrency = 4;
    const pool = [...segments.entries()];

    const worker = async () => {
      while (pool.length > 0) {
        if (abortSignal && abortSignal.aborted) {
          throw new Error('Download geannuleerd door gebruiker.');
        }

        const item = pool.shift();
        if (!item) break;
        const [index, segUrl] = item;

        let rawChunk = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          try {
            rawChunk = await this.fetchBuffer(segUrl);
            break;
          } catch (err) {
            attempts++;
            if (attempts >= maxAttempts) throw err;
            await new Promise((r) => setTimeout(r, 600));
          }
        }

        // Decrypt if stream is AES encrypted
        if (cryptoKey && rawChunk) {
          let iv = keyInfo.iv;
          if (!iv) {
            // Default IV is the 1-based sequence number as 16-byte Big-Endian
            iv = new Uint8Array(16);
            new DataView(iv.buffer).setUint32(12, index + 1, false);
          }
          rawChunk = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, cryptoKey, rawChunk);
        }

        downloadedChunks[index + (initSegmentUrl ? 1 : 0)] = rawChunk;
        completed++;

        const percent = Math.floor((completed / total) * 98);
        progressCb({
          status: `Segmenten downloaden: ${completed} / ${total}`,
          percent: percent
        });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, segments.length) }, () => worker())
    );

    // 6. Merge chunks and trigger download
    progressCb({ status: 'Bestand samenvoegen en opslaan...', percent: 99 });
    const isFmp4 = Boolean(initSegmentUrl);
    const mimeType = isFmp4 ? 'video/mp4' : 'video/mp2t';
    const finalBlob = new Blob(downloadedChunks, { type: mimeType });

    const cleanFilename = filename.endsWith('.ts') || filename.endsWith('.mp4')
      ? filename
      : `${filename}${isFmp4 ? '.mp4' : '.ts'}`;

    await this.saveBlob(finalBlob, cleanFilename);
    progressCb({ status: 'Download voltooid!', percent: 100 });
  }

  /**
   * Saves a Blob to the user's Downloads using the browser Downloads API or anchor click fallback.
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
