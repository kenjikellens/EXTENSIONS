// ==UserScript==
// @name         Any Video Downloader v2 (HLS / DASH / MP4 / Blob)
// @namespace    https://tampermonkey.net/
// @version      2.0
// @description  Detecteer, sniff en download HTML5 video's, HLS (.m3u8 met kwaliteitskeuze), DASH (.mpd), Blobs en directe videobestanden.
// @match        *://*/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ==========================================================================
       1. STATE & STREAM REGISTRY
       ========================================================================== */

    /**
     * Centrale opslag voor alle gedetecteerde streams op de huidige pagina.
     */
    class StreamRegistry {
        constructor() {
            this.streams = new Map(); // key: url, value: StreamInfo
            this.listeners = [];
        }

        /**
         * Voegt een stream toe indien nog niet geregistreerd.
         * @param {Object} item - { url, type, title, resolution, format }
         */
        register(item) {
            if (!item.url || this.streams.has(item.url)) return;

            // Negeer kleine segmenten of analytics
            if (this._isIgnoredUrl(item.url)) return;

            const streamInfo = {
                id: 'stream_' + Math.random().toString(36).substr(2, 9),
                url: item.url,
                type: item.type || 'direct', // 'hls' | 'dash' | 'direct' | 'blob'
                title: item.title || document.title || 'Video',
                resolution: item.resolution || null,
                bitrate: item.bitrate || null,
                variants: item.variants || [],
                timestamp: Date.now()
            };

            this.streams.set(item.url, streamInfo);
            this._notify(streamInfo);
        }

        /**
         * Filtert analytics en sub-segmenten om de lijst schoon te houden.
         */
        _isIgnoredUrl(url) {
            const lower = url.toLowerCase();
            return lower.includes('google-analytics') ||
                   lower.includes('/telemetry') ||
                   lower.includes('doubleclick') ||
                   (lower.endsWith('.ts') && !lower.includes('m3u8')) ||
                   (lower.endsWith('.m4s') && !lower.includes('mpd'));
        }

        subscribe(callback) {
            this.listeners.push(callback);
        }

        _notify(streamInfo) {
            this.listeners.forEach(cb => cb(streamInfo, Array.from(this.streams.values())));
        }

        getAll() {
            return Array.from(this.streams.values());
        }
    }

    const registry = new StreamRegistry();

    /* ==========================================================================
       2. NETWORK SNIFFER & HOOKS (Fetch, XHR, DOM, MSE)
       ========================================================================== */

    class NetworkSniffer {
        static init() {
            this.hookFetch();
            this.hookXHR();
            this.hookDOM();
        }

        /**
         * Onderschept window.fetch aanroepen naar videobestanden en manifests.
         */
        static hookFetch() {
            const originalFetch = window.fetch;
            window.fetch = async function (...args) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
                if (url) NetworkSniffer.inspectUrl(url);
                return originalFetch.apply(this, args);
            };
        }

        /**
         * Onderschept XMLHttpRequest aanroepen naar videobestanden en manifests.
         */
        static hookXHR() {
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url) {
                if (url) NetworkSniffer.inspectUrl(url);
                return originalOpen.apply(this, arguments);
            };
        }

        /**
         * Onderschept video tags in de DOM en wijzigingen daarin.
         */
        static hookDOM() {
            const scanDOM = () => {
                const videoElements = document.querySelectorAll('video');
                videoElements.forEach(video => {
                    const src = video.currentSrc || video.src;
                    if (src) {
                        NetworkSniffer.inspectUrl(src, {
                            resolution: video.videoWidth ? `${video.videoWidth}x${video.videoHeight}` : null
                        });
                    }
                    video.querySelectorAll('source').forEach(source => {
                        if (source.src) NetworkSniffer.inspectUrl(source.src);
                    });
                });
            };

            // Periodieke check en observer
            setInterval(scanDOM, 2500);
            document.addEventListener('DOMContentLoaded', scanDOM);

            const observer = new MutationObserver(() => scanDOM());
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }

        /**
         * Analyseert een URL en classificeert het videotype.
         */
        static inspectUrl(url, extra = {}) {
            try {
                if (typeof url !== 'string') return;
                const fullUrl = new URL(url, window.location.href).href;
                const cleanUrl = fullUrl.split('?')[0].toLowerCase();

                if (cleanUrl.includes('.m3u8')) {
                    registry.register({ url: fullUrl, type: 'hls', ...extra });
                } else if (cleanUrl.includes('.mpd')) {
                    registry.register({ url: fullUrl, type: 'dash', ...extra });
                } else if (/\.(mp4|webm|mkv|ogg|mov|m4v)($|\?)/i.test(fullUrl)) {
                    registry.register({ url: fullUrl, type: 'direct', ...extra });
                } else if (fullUrl.startsWith('blob:') && !fullUrl.includes(window.location.host + '/')) {
                    registry.register({ url: fullUrl, type: 'blob', ...extra });
                }
            } catch {
                // Ongeldige URL negeren
            }
        }
    }

    NetworkSniffer.init();

    /* ==========================================================================
       3. HLS (.M3U8) PARSER & CHUNK DOWNLOADER ENGINE
       ========================================================================== */

    class HLSDownloaderEngine {
        /**
         * Haalt tekst op via GM_xmlhttpRequest om CORS te omzeilen.
         */
        static fetchText(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    onload: res => res.status >= 200 && res.status < 300 ? resolve(res.responseText) : reject(new Error(`HTTP ${res.status}`)),
                    onerror: reject
                });
            });
        }

        /**
         * Haalt binaire segment-data op.
         */
        static fetchBuffer(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'arraybuffer',
                    onload: res => res.status >= 200 && res.status < 300 ? resolve(res.response) : reject(new Error(`HTTP ${res.status}`)),
                    onerror: reject
                });
            });
        }

        /**
         * Parseert een master playlist naar beschikbare kwaliteiten.
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
         * Parseert media playlist segmenten en eventuele encryptie-sleutels.
         */
        static async parseMediaPlaylist(mediaUrl) {
            const content = await this.fetchText(mediaUrl);
            const lines = content.split(/\r?\n/);
            const segments = [];
            let keyInfo = null;
            let initSegmentUrl = null;

            for (let line of lines) {
                line = line.trim();

                // Encryptie detecteren (AES-128)
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

                // Init segment voor fMP4
                if (line.startsWith('#EXT-X-MAP:')) {
                    const uriMatch = line.match(/URI="([^"]+)"/);
                    if (uriMatch) {
                        initSegmentUrl = new URL(uriMatch[1], mediaUrl).href;
                    }
                }

                // Normaal segment
                if (line && !line.startsWith('#')) {
                    segments.push(new URL(line, mediaUrl).href);
                }
            }

            return { segments, keyInfo, initSegmentUrl };
        }

        /**
         * Converteert Hex naar Uint8Array voor AES IV.
         */
        static _hexToUint8Array(hex) {
            const clean = hex.length % 2 !== 0 ? '0' + hex : hex;
            const bytes = new Uint8Array(clean.length / 2);
            for (let i = 0; i < clean.length; i += 2) {
                bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
            }
            return bytes;
        }

        /**
         * Downloadt en ontcijfert alle segmenten, en voegt ze samen.
         */
        static async downloadAndMergeHLS(mediaUrl, filename, progressCb, abortSignal) {
            progressCb({ status: 'Manifest inlezen...', percent: 0 });

            // 1. Check of het een Master Playlist is
            let targetPlaylistUrl = mediaUrl;
            try {
                const variants = await this.parseMasterPlaylist(mediaUrl);
                if (variants.length > 0) {
                    // Sorteer op hoogste resolutie / bitrate
                    variants.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
                    targetPlaylistUrl = variants[0].url;
                }
            } catch {
                // Was al een directe media playlist
            }

            // 2. Parseer segmenten
            const { segments, keyInfo, initSegmentUrl } = await this.parseMediaPlaylist(targetPlaylistUrl);

            if (!segments.length) {
                throw new Error('Geen video-segmenten gevonden in deze playlist.');
            }

            // 3. Haal evt. AES sleutel op
            let cryptoKey = null;
            if (keyInfo) {
                progressCb({ status: 'Decryptiesleutel ophalen...', percent: 2 });
                const rawKey = await this.fetchBuffer(keyInfo.keyUrl);
                cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['decrypt']);
            }

            const downloadedChunks = [];
            const total = segments.length + (initSegmentUrl ? 1 : 0);
            let completed = 0;

            // 4. Init segment ophalen (fMP4 streams)
            if (initSegmentUrl) {
                const initBuf = await this.fetchBuffer(initSegmentUrl);
                downloadedChunks.push(initBuf);
                completed++;
            }

            // 5. Parallel downloaden met concurrency limit (3 tegelijk)
            const concurrency = 3;
            const pool = [...segments.entries()];

            const worker = async () => {
                while (pool.length > 0) {
                    if (abortSignal && abortSignal.aborted) throw new Error('Download geannuleerd');

                    const [index, segUrl] = pool.shift();
                    let rawChunk = await this.fetchBuffer(segUrl);

                    // Decrypt indien nodig
                    if (cryptoKey) {
                        let iv = keyInfo.iv;
                        if (!iv) {
                            // Default IV is sequence number als 16-byte Big Endian
                            iv = new Uint8Array(16);
                            new DataView(iv.buffer).setUint32(12, index + 1, false);
                        }
                        rawChunk = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, cryptoKey, rawChunk);
                    }

                    downloadedChunks[index + (initSegmentUrl ? 1 : 0)] = rawChunk;
                    completed++;

                    const percent = Math.floor((completed / total) * 100);
                    progressCb({
                        status: `Downloaden segmenten: ${completed}/${total}`,
                        percent: percent
                    });
                }
            };

            await Promise.all(Array.from({ length: concurrency }, () => worker()));

            // 6. Samenvoegen tot één Blob
            progressCb({ status: 'Bestand samenvoegen en opslaan...', percent: 99 });
            const finalBlob = new Blob(downloadedChunks, { type: 'video/mp2t' });
            this._saveBlob(finalBlob, filename || 'hls-video.ts');

            progressCb({ status: 'Download voltooid!', percent: 100 });
        }

        static _saveBlob(blob, filename) {
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        }
    }

    /* ==========================================================================
       4. USER INTERFACE (Floating Dock, Panel & Progress)
       ========================================================================== */

    class DownloaderUI {
        constructor() {
            this.panel = null;
            this.badge = null;
            this.activeAbortController = null;
            this.createElements();
            this.bindEvents();
        }

        createElements() {
            // Floating Trigger Button met Badge
            const triggerBtn = document.createElement('button');
            triggerBtn.id = 'tm-video-trigger-btn';
            triggerBtn.innerHTML = `🎥 <span id="tm-video-count" style="display:none;background:#e50914;color:#fff;font-size:11px;padding:2px 6px;border-radius:10px;margin-left:4px;">0</span>`;
            Object.assign(triggerBtn.style, {
                position: 'fixed',
                right: '20px',
                bottom: '20px',
                zIndex: '2147483646',
                background: '#141414',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '50px',
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                transition: 'transform 0.2s, background 0.2s'
            });

            document.body.appendChild(triggerBtn);
            this.triggerBtn = triggerBtn;

            // Main Panel
            const panel = document.createElement('div');
            panel.id = 'tm-video-panel';
            Object.assign(panel.style, {
                position: 'fixed',
                right: '20px',
                bottom: '75px',
                width: '380px',
                maxHeight: '75vh',
                background: '#18181b',
                color: '#f4f4f5',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
                zIndex: '2147483647',
                display: 'none',
                flexDirection: 'column',
                overflow: 'hidden',
                fontFamily: 'Segoe UI, system-ui, -apple-system, sans-serif'
            });

            panel.innerHTML = `
                <div style="padding: 14px 16px; background: #27272a; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                        ⚡ Any Video Downloader <span style="font-size: 11px; background: #3f3f46; padding: 2px 6px; border-radius: 6px;">v2.0</span>
                    </span>
                    <button id="tm-panel-close" style="background:transparent;border:0;color:#a1a1aa;font-size:18px;cursor:pointer;padding:0 4px;">✕</button>
                </div>

                <div id="tm-progress-container" style="display:none; padding: 12px 16px; background: #09090b; border-bottom: 1px solid #27272a;">
                    <div id="tm-progress-label" style="font-size: 12px; margin-bottom: 6px; color: #a1a1aa;">Download voorbereiden...</div>
                    <div style="width: 100%; height: 6px; background: #27272a; border-radius: 3px; overflow: hidden; position: relative;">
                        <div id="tm-progress-bar" style="width: 0%; height: 100%; background: #3b82f6; transition: width 0.2s;"></div>
                    </div>
                    <button id="tm-cancel-btn" style="margin-top: 8px; font-size: 11px; background: #ef4444; color: white; border: 0; padding: 3px 8px; border-radius: 4px; cursor: pointer;">Annuleren</button>
                </div>

                <div id="tm-stream-list" style="padding: 12px 16px; overflow-y: auto; max-height: calc(75vh - 170px); display: flex; flex-direction: column; gap: 10px;">
                    <div style="color: #71717a; font-size: 13px; text-align: center; padding: 20px 0;">Zoeken naar video streams...</div>
                </div>

                <div style="padding: 12px 16px; background: #202024; border-top: 1px solid rgba(255,255,255,0.08);">
                    <div style="display: flex; gap: 6px;">
                        <input id="tm-manual-url" type="text" placeholder="Plak video of .m3u8 URL..." style="flex: 1; background: #141416; border: 1px solid #3f3f46; color: #fff; padding: 7px 10px; border-radius: 8px; font-size: 12px;" />
                        <button id="tm-manual-btn" style="background: #2563eb; color: #fff; border: 0; padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;">Download</button>
                    </div>
                </div>
            `;

            document.body.appendChild(panel);
            this.panel = panel;
        }

        bindEvents() {
            this.triggerBtn.onclick = () => {
                this.panel.style.display = this.panel.style.display === 'none' ? 'flex' : 'none';
            };

            this.panel.querySelector('#tm-panel-close').onclick = () => {
                this.panel.style.display = 'none';
            };

            this.panel.querySelector('#tm-manual-btn').onclick = () => {
                const input = this.panel.querySelector('#tm-manual-url');
                const url = input.value.trim();
                if (url) {
                    NetworkSniffer.inspectUrl(url);
                    this.startDownload({ url: url, type: url.includes('.m3u8') ? 'hls' : 'direct' });
                    input.value = '';
                }
            };

            this.panel.querySelector('#tm-cancel-btn').onclick = () => {
                if (this.activeAbortController) {
                    this.activeAbortController.abort();
                    this.hideProgress();
                }
            };

            // Luister naar nieuwe streams
            registry.subscribe((_, streams) => this.renderStreams(streams));
        }

        renderStreams(streams) {
            const countBadge = this.triggerBtn.querySelector('#tm-video-count');
            if (streams.length > 0) {
                countBadge.style.display = 'inline-block';
                countBadge.textContent = streams.length;
            }

            const listContainer = this.panel.querySelector('#tm-stream-list');
            listContainer.innerHTML = '';

            if (streams.length === 0) {
                listContainer.innerHTML = `<div style="color: #71717a; font-size: 13px; text-align: center; padding: 20px 0;">Geen video streams gedetecteerd.</div>`;
                return;
            }

            streams.forEach((stream, index) => {
                const item = document.createElement('div');
                Object.assign(item.style, {
                    background: '#27272a',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                });

                const badgeColor = stream.type === 'hls' ? '#8b5cf6' : stream.type === 'dash' ? '#f59e0b' : '#10b981';

                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 10px; font-weight: 700; background: ${badgeColor}; color: #fff; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
                            ${stream.type}
                        </span>
                        <span style="font-size: 11px; color: #a1a1aa; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${stream.resolution ? stream.resolution : 'Stream #' + (index + 1)}
                        </span>
                    </div>
                    <div style="font-size: 11px; color: #71717a; word-break: break-all; max-height: 32px; overflow: hidden;">
                        ${stream.url}
                    </div>
                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                        <button class="tm-dl-btn" style="flex: 1; background: #3b82f6; color: #fff; border: 0; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                            ⬇ Download
                        </button>
                        <button class="tm-copy-btn" style="background: #3f3f46; color: #fff; border: 0; padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;">
                            📋 Kopiëren
                        </button>
                    </div>
                `;

                item.querySelector('.tm-dl-btn').onclick = () => this.startDownload(stream);
                item.querySelector('.tm-copy-btn').onclick = () => {
                    navigator.clipboard.writeText(stream.url);
                    alert('URL gekopieerd naar klembord!');
                };

                listContainer.appendChild(item);
            });
        }

        showProgress(status, percent) {
            const container = this.panel.querySelector('#tm-progress-container');
            const label = this.panel.querySelector('#tm-progress-label');
            const bar = this.panel.querySelector('#tm-progress-bar');

            container.style.display = 'block';
            label.textContent = status;
            bar.style.width = `${percent}%`;
        }

        hideProgress() {
            const container = this.panel.querySelector('#tm-progress-container');
            container.style.display = 'none';
        }

        async startDownload(stream) {
            const filename = (document.title.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'video') + (stream.type === 'hls' ? '.ts' : '.mp4');

            if (stream.type === 'hls') {
                this.activeAbortController = new AbortController();
                try {
                    await HLSDownloaderEngine.downloadAndMergeHLS(
                        stream.url,
                        filename,
                        (p) => this.showProgress(p.status, p.percent),
                        this.activeAbortController.signal
                    );
                    setTimeout(() => this.hideProgress(), 3000);
                } catch (err) {
                    alert('HLS Download fout: ' + err.message);
                    this.hideProgress();
                }
            } else if (stream.type === 'direct') {
                GM_download({
                    url: stream.url,
                    name: filename,
                    saveAs: true,
                    onerror: () => window.open(stream.url, '_blank')
                });
            } else if (stream.type === 'blob') {
                try {
                    const res = await fetch(stream.url);
                    const blob = await res.blob();
                    HLSDownloaderEngine._saveBlob(blob, filename);
                } catch (err) {
                    alert('Kon blob niet rechtstreeks ophalen. De stream is beveiligd of via segmenten opgebouwd.');
                }
            } else {
                alert(`Formaat ${stream.type} wordt direct geopend.`);
                window.open(stream.url, '_blank');
            }
        }
    }

    /* ==========================================================================
       5. INITIALISATIE
       ========================================================================== */

    function init() {
        new DownloaderUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
