/**
 * @file popup.js
 * @description UI Controller for the Any Video Downloader extension popup.
 * Manages active tab stream detection, quality modal, HLS download engine, and user notifications.
 */

import { HLSDownloaderEngine } from './hls-downloader.js';

class PopupController {
  constructor() {
    this.activeTab = null;
    this.streams = [];
    this.filteredStreams = [];
    this.activeAbortController = null;

    this.cacheDomElements();
    this.bindEvents();
    this.init();
  }

  /**
   * Caches references to DOM elements in the popup.
   */
  cacheDomElements() {
    this.elements = {
      pageTitleLabel: document.getElementById('pageTitleLabel'),
      streamList: document.getElementById('streamList'),
      emptyState: document.getElementById('emptyState'),
      clearStreamsBtn: document.getElementById('clearStreamsBtn'),
      themeToggleBtn: document.getElementById('themeToggleBtn'),
      themeToggleImg: document.getElementById('themeToggleImg'),
      searchFilterInput: document.getElementById('searchFilterInput'),
      manualUrlInput: document.getElementById('manualUrlInput'),
      manualDownloadBtn: document.getElementById('manualDownloadBtn'),
      progressSection: document.getElementById('downloadProgressSection'),
      progressStatusLabel: document.getElementById('progressStatusLabel'),
      progressPercentLabel: document.getElementById('progressPercentLabel'),
      progressBarFill: document.getElementById('progressBarFill'),
      cancelDownloadBtn: document.getElementById('cancelDownloadBtn'),
      qualityModal: document.getElementById('qualityModal'),
      qualityList: document.getElementById('qualityList'),
      closeQualityModalBtn: document.getElementById('closeQualityModalBtn'),
      toast: document.getElementById('toastNotification')
    };
  }

  /**
   * Binds user interaction event handlers.
   */
  bindEvents() {
    // Theme toggle
    if (this.elements.themeToggleBtn) {
      this.elements.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Clear streams
    this.elements.clearStreamsBtn.addEventListener('click', () => this.handleClearStreams());

    // Search / Filter
    this.elements.searchFilterInput.addEventListener('input', (e) => {
      this.filterStreams(e.target.value.trim().toLowerCase());
    });

    // Manual Download
    this.elements.manualDownloadBtn.addEventListener('click', () => this.handleManualDownload());
    this.elements.manualUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleManualDownload();
    });

    // Cancel active download
    this.elements.cancelDownloadBtn.addEventListener('click', () => this.cancelActiveDownload());

    // Close quality modal
    this.elements.closeQualityModalBtn.addEventListener('click', () => this.hideQualityModal());
    this.elements.qualityModal.addEventListener('click', (e) => {
      if (e.target === this.elements.qualityModal) this.hideQualityModal();
    });
  }

  /**
   * Loads saved theme preference (light/dark) from browser storage.
   */
  async initTheme() {
    try {
      const data = await chrome.storage.local.get(['avd_theme']);
      const currentTheme = data.avd_theme || 'dark';
      this.applyTheme(currentTheme);
    } catch {
      this.applyTheme('dark');
    }
  }

  /**
   * Toggles between dark and light themes.
   */
  async toggleTheme() {
    const isLight = document.body.classList.contains('theme-light');
    const newTheme = isLight ? 'dark' : 'light';
    this.applyTheme(newTheme);
    try {
      await chrome.storage.local.set({ avd_theme: newTheme });
    } catch {
      // Storage write error
    }
  }

  /**
   * Applies the theme classes and updates toggle button icon.
   * @param {'dark'|'light'} theme - Target theme
   */
  applyTheme(theme) {
    if (theme === 'light') {
      document.body.classList.add('theme-light');
      if (this.elements.themeToggleImg) {
        this.elements.themeToggleImg.src = 'svg/moon.svg';
        this.elements.themeToggleBtn.title = 'Wissel naar Donker thema';
      }
    } else {
      document.body.classList.remove('theme-light');
      if (this.elements.themeToggleImg) {
        this.elements.themeToggleImg.src = 'svg/sun.svg';
        this.elements.themeToggleBtn.title = 'Wissel naar Licht thema';
      }
    }
  }

  /**
   * Initializes popup by querying the active browser tab.
   */
  async init() {
    await this.initTheme();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        this.elements.pageTitleLabel.textContent = 'Geen actieve tab gevonden';
        return;
      }

      this.activeTab = tab;
      this.elements.pageTitleLabel.textContent = tab.title || tab.url || 'Huidige pagina';

      this.fetchTabStreams();
    } catch {
      this.elements.pageTitleLabel.textContent = 'Kon actieve tab niet uitlezen';
    }
  }

  /**
   * Fetches the detected streams for the active tab from background service worker.
   */
  fetchTabStreams() {
    if (!this.activeTab) return;

    chrome.runtime.sendMessage(
      { action: 'GET_TAB_STREAMS', tabId: this.activeTab.id },
      (response) => {
        if (response && response.success) {
          this.streams = response.streams || [];
          if (response.title) {
            this.elements.pageTitleLabel.textContent = response.title;
          }
          this.filteredStreams = [...this.streams];
          this.renderStreams();
        }
      }
    );
  }

  /**
   * Filters the displayed streams based on search query.
   * @param {string} query - Search term
   */
  filterStreams(query) {
    if (!query) {
      this.filteredStreams = [...this.streams];
    } else {
      this.filteredStreams = this.streams.filter((s) => {
        const titleMatch = (s.title || '').toLowerCase().includes(query);
        const urlMatch = s.url.toLowerCase().includes(query);
        const typeMatch = s.type.toLowerCase().includes(query);
        const resMatch = (s.resolution || '').toLowerCase().includes(query);
        return titleMatch || urlMatch || typeMatch || resMatch;
      });
    }
    this.renderStreams();
  }

  /**
   * Clears streams stored in background for this tab.
   */
  handleClearStreams() {
    if (!this.activeTab) return;

    chrome.runtime.sendMessage(
      { action: 'CLEAR_TAB_STREAMS', tabId: this.activeTab.id },
      () => {
        this.streams = [];
        this.filteredStreams = [];
        this.renderStreams();
        this.showToast('Stream lijst gewist');
      }
    );
  }

  /**
   * Handles manual URL input download submission.
   */
  handleManualDownload() {
    const url = this.elements.manualUrlInput.value.trim();
    if (!url) return;

    const lower = url.toLowerCase();
    let streamType = 'direct';
    if (lower.includes('.m3u8')) streamType = 'hls';
    else if (lower.includes('.mpd')) streamType = 'dash';
    else if (lower.startsWith('blob:')) streamType = 'blob';

    const manualStream = {
      id: `manual_${Date.now()}`,
      url: url,
      type: streamType,
      title: 'Handmatige Stream',
      detectedAt: Date.now()
    };

    this.elements.manualUrlInput.value = '';
    this.startDownload(manualStream);
  }

  /**
   * Renders stream cards in the popup list container.
   */
  renderStreams() {
    this.elements.streamList.innerHTML = '';

    if (this.filteredStreams.length === 0) {
      this.elements.emptyState.classList.add('empty-state--visible');
      return;
    }

    this.elements.emptyState.classList.remove('empty-state--visible');

    this.filteredStreams.forEach((stream, index) => {
      const card = document.createElement('div');
      card.className = 'stream-card';

      // Badge type modifier
      const badgeClass = `status-badge--${stream.type}`;

      // Resolution label
      const resLabel = stream.resolution ? stream.resolution : `Stream #${index + 1}`;

      // Card structure
      card.innerHTML = `
        <div class="stream-card__top">
          <div class="stream-card__meta">
            <span class="status-badge ${badgeClass}">${stream.type}</span>
            <span class="stream-card__res">${resLabel}</span>
          </div>
          <span class="stream-card__source">${stream.source || 'webRequest'}</span>
        </div>
        <div class="stream-card__title">${this.escapeHtml(stream.title || 'Video Stream')}</div>
        <div class="stream-card__url" title="${this.escapeHtml(stream.url)}">${this.escapeHtml(stream.url)}</div>
        <div class="stream-card__actions">
          <button class="pill-btn pill-btn--primary btn-download">
            <img src="svg/download.svg" alt="Download" class="pill-btn__img" />
            <span>Download</span>
          </button>
          <button class="pill-btn pill-btn--secondary btn-copy" title="Kopieer URL">
            <img src="svg/copy.svg" alt="Kopiëren" class="pill-btn__img" />
            <span>Kopieer</span>
          </button>
        </div>
      `;

      // Event bindings
      card.querySelector('.btn-download').addEventListener('click', () => {
        if (stream.type === 'hls') {
          this.checkAndDownloadHLS(stream);
        } else {
          this.startDownload(stream);
        }
      });

      card.querySelector('.btn-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(stream.url);
        this.showToast('URL gekopieerd naar klembord!');
      });

      this.elements.streamList.appendChild(card);
    });
  }

  /**
   * Inspects HLS master playlist for multiple qualities before starting download.
   * @param {Object} stream - Stream object
   */
  async checkAndDownloadHLS(stream) {
    try {
      this.showProgress('Kwaliteiten analyseren...', 0);
      const variants = await HLSDownloaderEngine.parseMasterPlaylist(stream.url);
      this.hideProgress();

      if (variants && variants.length > 1) {
        this.showQualityModal(variants, stream);
      } else {
        this.startDownload(stream);
      }
    } catch {
      this.hideProgress();
      this.startDownload(stream);
    }
  }

  /**
   * Displays the quality selection modal for multi-variant HLS streams.
   * @param {Array} variants - Array of variant objects
   * @param {Object} baseStream - Original stream metadata
   */
  showQualityModal(variants, baseStream) {
    this.elements.qualityList.innerHTML = '';

    // Sort by bandwidth descending
    variants.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));

    variants.forEach((v) => {
      const btn = document.createElement('button');
      btn.className = 'quality-item-btn';

      const resText = v.resolution || 'Auto Resolutie';
      const bitRateText = v.bandwidth ? `~${Math.round(v.bandwidth / 1000)} kbps` : '';

      btn.innerHTML = `
        <span><strong>${resText}</strong></span>
        <span style="color: #9ca3af; font-size: 11px;">${bitRateText}</span>
      `;

      btn.addEventListener('click', () => {
        this.hideQualityModal();
        this.startDownload({
          ...baseStream,
          url: v.url,
          resolution: v.resolution
        });
      });

      this.elements.qualityList.appendChild(btn);
    });

    this.elements.qualityModal.classList.remove('modal-backdrop--hidden');
  }

  /**
   * Hides the quality selection modal.
   */
  hideQualityModal() {
    this.elements.qualityModal.classList.add('modal-backdrop--hidden');
  }

  /**
   * Starts downloading the specified stream.
   * @param {Object} stream - Stream metadata object
   */
  async startDownload(stream) {
    const rawTitle = (stream.title || (this.activeTab && this.activeTab.title) || 'video')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .trim();

    const filename = `${rawTitle || 'video'}`;

    if (stream.type === 'hls') {
      this.activeAbortController = new AbortController();
      this.showProgress('Voorbereiden...', 0);

      try {
        await HLSDownloaderEngine.downloadAndMergeHLS(
          stream.url,
          filename,
          (progress) => {
            this.showProgress(progress.status, progress.percent);
          },
          this.activeAbortController.signal
        );

        this.showToast('Download succesvol voltooid!');
        setTimeout(() => this.hideProgress(), 2500);
      } catch (err) {
        this.hideProgress();
        this.showToast(`Fout: ${err.message}`);
      }
    } else if (stream.type === 'direct') {
      chrome.runtime.sendMessage(
        {
          action: 'DOWNLOAD_DIRECT',
          url: stream.url,
          filename: `${filename}.mp4`
        },
        (res) => {
          if (res && res.success) {
            this.showToast('Download gestart via browser!');
          } else {
            window.open(stream.url, '_blank');
          }
        }
      );
    } else if (stream.type === 'blob') {
      try {
        this.showProgress('Blob ophalen...', 50);
        const res = await fetch(stream.url);
        const blob = await res.blob();
        await HLSDownloaderEngine.saveBlob(blob, `${filename}.mp4`);
        this.hideProgress();
        this.showToast('Blob video opgeslagen!');
      } catch {
        this.hideProgress();
        this.showToast('Kon blob niet rechtstreeks downloaden.');
        window.open(stream.url, '_blank');
      }
    } else {
      this.showToast(`Formaat ${stream.type} wordt geopend...`);
      window.open(stream.url, '_blank');
    }
  }

  /**
   * Updates and reveals the active download progress card.
   * @param {string} status - Status message
   * @param {number} percent - Progress percentage (0 - 100)
   */
  showProgress(status, percent) {
    this.elements.progressSection.classList.remove('progress-card--hidden');
    this.elements.progressStatusLabel.textContent = status;
    this.elements.progressPercentLabel.textContent = `${percent}%`;
    this.elements.progressBarFill.style.width = `${percent}%`;
  }

  /**
   * Hides the active download progress card.
   */
  hideProgress() {
    this.elements.progressSection.classList.add('progress-card--hidden');
    this.elements.progressBarFill.style.width = '0%';
  }

  /**
   * Cancels the active stream download if running.
   */
  cancelActiveDownload() {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.hideProgress();
      this.showToast('Download geannuleerd.');
    }
  }

  /**
   * Shows a brief toast feedback notification.
   * @param {string} message - Message text
   */
  showToast(message) {
    this.elements.toast.textContent = message;
    this.elements.toast.classList.remove('toast--hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.elements.toast.classList.add('toast--hidden');
    }, 2800);
  }

  /**
   * Utility to safely escape HTML string values.
   * @param {string} str - Raw string
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}

// Instantiate controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
