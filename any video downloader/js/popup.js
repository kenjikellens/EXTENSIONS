/**
 * @file popup.js
 * @description Main OOP Orchestrator for the Any Video Downloader extension popup.
 */

import { applyI18n, t } from './i18n.js';
import { HelperBridge } from './helper-bridge.js';
import { HelperPackageBuilder } from './helper-bundle.js';
import { HLSDownloaderEngine } from './hls-downloader.js';
import { ThemeManager } from './theme-manager.js';
import { ViewManager } from './view-manager.js';

class PopupOrchestrator {
  constructor() {
    this.activeTab = null;
    this.streams = [];
    this.filteredStreams = [];
    this.stopPolling = null;
    this.activeAbortController = null;
    this.autoPollTimer = null;
    this.currentLanguage = 'nl';
    this.currentVideoData = null;

    this.helperBridge = new HelperBridge();
    this.themeManager = new ThemeManager();

    this.cacheDomElements();
    this.viewManager = new ViewManager(this.elements);
    this.bindEvents();
    this.init();
  }

  /**
   * Caches all required DOM elements.
   */
  cacheDomElements() {
    this.elements = {
      // Header
      clearStreamsBtn: document.getElementById('clearStreamsBtn'),
      refreshStatusBtn: document.getElementById('refreshStatusBtn'),
      settingsBtn: document.getElementById('settingsBtn'),
      // Settings Modal
      settingsModal: document.getElementById('settingsModal'),
      closeSettingsBtn: document.getElementById('closeSettingsBtn'),
      languageSelect: document.getElementById('languageSelect'),
      // Video info card
      videoInfoSection: document.getElementById('videoInfoSection'),
      videoThumbImg: document.getElementById('videoThumbImg'),
      videoTitleLabel: document.getElementById('videoTitleLabel'),
      videoDurationLabel: document.getElementById('videoDurationLabel'),
      // Setup banner
      setupBanner: document.getElementById('setupBanner'),
      downloadHelperBtn: document.getElementById('downloadHelperBtn'),
      checkHelperNowBtn: document.getElementById('checkHelperNowBtn'),
      // Categorized tab container
      categoryContainer: document.getElementById('categoryContainer'),
      tabVideoBtn: document.getElementById('tabVideoBtn'),
      tabAudioBtn: document.getElementById('tabAudioBtn'),
      tabSubBtn: document.getElementById('tabSubBtn'),
      categoryList: document.getElementById('categoryList'),
      // Standard stream list & fetching
      standardStreamContainer: document.getElementById('standardStreamContainer'),
      fetchingState: document.getElementById('fetchingState'),
      streamList: document.getElementById('streamList'),
      emptyState: document.getElementById('emptyState'),
      // Filter & manual inputs
      filterBarSection: document.getElementById('filterBarSection'),
      searchFilterInput: document.getElementById('searchFilterInput'),
      manualUrlInput: document.getElementById('manualUrlInput'),
      manualDownloadBtn: document.getElementById('manualDownloadBtn'),
      // Progress card (for downloads only)
      progressSection: document.getElementById('downloadProgressSection'),
      progressStatusLabel: document.getElementById('progressStatusLabel'),
      progressPercentLabel: document.getElementById('progressPercentLabel'),
      progressBarFill: document.getElementById('progressBarFill'),
      progressSpeedLabel: document.getElementById('progressSpeedLabel'),
      cancelDownloadBtn: document.getElementById('cancelDownloadBtn'),
      // Toast
      toast: document.getElementById('toastNotification')
    };
  }

  /**
   * Binds global event handlers.
   */
  bindEvents() {
    this.elements.clearStreamsBtn.addEventListener('click', () => this.handleClearStreams());

    if (this.elements.refreshStatusBtn) {
      this.elements.refreshStatusBtn.addEventListener('click', () => this.refreshCurrentView());
    }

    if (this.elements.checkHelperNowBtn) {
      this.elements.checkHelperNowBtn.addEventListener('click', () => this.refreshCurrentView());
    }

    if (this.elements.settingsBtn) {
      this.elements.settingsBtn.addEventListener('click', () => this.openSettings());
    }

    if (this.elements.closeSettingsBtn) {
      this.elements.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    }

    if (this.elements.languageSelect) {
      this.elements.languageSelect.addEventListener('change', (e) => this.changeLanguage(e.target.value));
    }

    if (this.elements.settingsModal) {
      this.elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === this.elements.settingsModal) this.closeSettings();
      });
    }

    this.elements.searchFilterInput.addEventListener('input', (e) => {
      this.filterStreams(e.target.value.trim().toLowerCase());
    });

    this.elements.manualDownloadBtn.addEventListener('click', () => this.handleManualDownload());
    this.elements.manualUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleManualDownload();
    });

    this.elements.cancelDownloadBtn.addEventListener('click', () => this.cancelActiveDownload());
  }

  /**
   * Opens the settings modal.
   */
  openSettings() {
    if (this.elements.settingsModal) {
      this.elements.settingsModal.classList.remove('modal-overlay--hidden');
    }
  }

  /**
   * Closes the settings modal.
   */
  closeSettings() {
    if (this.elements.settingsModal) {
      this.elements.settingsModal.classList.add('modal-overlay--hidden');
    }
  }

  /**
   * Switches language and persists choice.
   * @param {string} lang
   */
  async changeLanguage(lang) {
    this.currentLanguage = lang;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ language: lang });
    }
    this.applyCurrentLanguage();
  }

  /**
   * Applies translations to DOM elements and sub-views.
   */
  applyCurrentLanguage() {
    applyI18n(this.currentLanguage);
    this.viewManager.setLanguage(this.currentLanguage);
    if (this.currentVideoData) {
      this.viewManager.renderCategorizedOptions(this.currentVideoData, (type, item) => {
        this.startHelperDownload(this.currentVideoData.url, type, item, this.currentVideoData.title);
      });
    }
    if (this.filteredStreams && this.filteredStreams.length > 0) {
      this.renderStandardStreams();
    }
  }

  /**
   * Manual refresh trigger.
   */
  async refreshCurrentView() {
    this.showToast('Server status controleren...');
    if (this.activeTab && this.activeTab.url) {
      const isYouTube = this.activeTab.url.includes('youtube.com/watch') || this.activeTab.url.includes('youtu.be/') || this.activeTab.url.includes('youtube.com/shorts');
      if (isYouTube) {
        await this.handleYouTubeTab(this.activeTab.url);
      } else {
        this.handleStandardTab(this.activeTab.id);
      }
    } else {
      await this.init();
    }
  }

  /**
   * Stops any running background auto-polling.
   */
  stopAutoPolling() {
    if (this.autoPollTimer) {
      clearInterval(this.autoPollTimer);
      this.autoPollTimer = null;
    }
  }

  /**
   * Starts automatic polling every 3.5 seconds to auto-detect when helper comes online.
   * @param {string} url - YouTube URL
   */
  startAutoPolling(url) {
    this.stopAutoPolling();
    this.autoPollTimer = setInterval(async () => {
      try {
        const health = await this.helperBridge.checkHealth();
        if (health.online) {
          this.stopAutoPolling();
          this.showToast('● Helper gedetecteerd! Formaten laden...');
          await this.handleYouTubeTab(url);
        }
      } catch {
        // Still offline, keep polling silently
      }
    }, 3500);
  }

  /**
   * Initializes theme, detects active tab, and branches between YouTube and streaming modes.
   */
  async init() {
    await this.themeManager.init();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const stored = await chrome.storage.local.get(['language']);
        if (stored && stored.language) {
          this.currentLanguage = stored.language;
        } else {
          // Dynamically detect user's browser/OS language!
          const browserLang = (navigator.language || 'en').split('-')[0].toLowerCase();
          const supported = ['nl', 'en', 'de', 'fr', 'es'];
          this.currentLanguage = supported.includes(browserLang) ? browserLang : 'en';
          await chrome.storage.local.set({ language: this.currentLanguage });
        }
      } catch {
        this.currentLanguage = 'en';
      }
    }

    if (this.elements.languageSelect) {
      this.elements.languageSelect.value = this.currentLanguage;
    }
    this.applyCurrentLanguage();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      this.activeTab = tab;

      const isYouTube = tab.url && (tab.url.includes('youtube.com/watch') || tab.url.includes('youtu.be/') || tab.url.includes('youtube.com/shorts'));

      if (isYouTube) {
        await this.handleYouTubeTab(tab.url);
      } else {
        this.handleStandardTab(tab.id);
      }
    } catch {
      // Fallback to standard
    }
  }

  /**
   * Orchestrates YouTube format loading, dependency readiness, and error presentation via the local helper bridge.
   * Directly affects popup visibility states, progress indicators, category views, and user toasts.
   * @param {string} url - Active YouTube URL
   */
  async handleYouTubeTab(url) {
    this.elements.filterBarSection.classList.add('filter-bar--hidden');
    this.elements.categoryContainer.classList.add('category-container--hidden');
    this.elements.standardStreamContainer.classList.remove('stream-container--hidden');

    const health = await this.helperBridge.checkHealth();

    if (health.online) {
      this.stopAutoPolling();
      this.viewManager.hideSetupBanner();
      try {
        this.viewManager.showFetching();
        const data = await this.helperBridge.getVideoInfo(url);
        this.viewManager.hideFetching();

        this.elements.standardStreamContainer.classList.add('stream-container--hidden');
        this.currentVideoData = data;
        this.viewManager.renderVideoHeader(data, true);
        this.viewManager.renderCategorizedOptions(data, (type, item) => {
          this.startHelperDownload(url, type, item, data.title);
        });
      } catch (err) {
        this.viewManager.hideFetching();
        const rawErr = err.message || '';
        let displayErr = `Fout bij laden: ${rawErr}`;
        if (rawErr.includes('WinError 2') || rawErr.includes('niet vinden') || rawErr.includes('ontbreekt')) {
          displayErr = 'yt-dlp component wordt geïnitialiseerd of ontbreekt. Herlaad over enkele seconden.';
        }
        this.showToast(displayErr);

        // Show setup banner on error so user can download/reinstall helper
        this.viewManager.renderSetupBanner(async () => {
          try {
            await HelperPackageBuilder.downloadHelperPackage();
            this.showToast(t('helper_downloaded', this.currentLanguage));
          } catch {
            this.showToast(t('helper_download_failed', this.currentLanguage));
          }
        });
      }
    } else {
      this.viewManager.hideFetching();
      this.viewManager.renderVideoHeader({ title: this.activeTab.title || 'YouTube Video' }, false);
      this.viewManager.renderSetupBanner(async () => {
        try {
          await HelperPackageBuilder.downloadHelperPackage();
          this.showToast(t('helper_downloaded', this.currentLanguage));
        } catch {
          this.showToast(t('helper_download_failed', this.currentLanguage));
        }
      });
      this.startAutoPolling(url);
    }
  }

  /**
   * Handles standard media tab sniffing (HLS .m3u8, MP4, DASH).
   * @param {number} tabId - Active tab ID
   */
  handleStandardTab(tabId) {
    this.elements.videoInfoSection.classList.add('video-info-card--hidden');
    this.elements.setupBanner.classList.add('setup-banner--hidden');
    this.elements.categoryContainer.classList.add('category-container--hidden');

    chrome.runtime.sendMessage({ action: 'GET_TAB_STREAMS', tabId }, (res) => {
      if (res && res.success) {
        this.streams = res.streams || [];
        this.filteredStreams = [...this.streams];
        this.renderStandardStreams();
      }
    });
  }  /**
   * Renders detected media streams for standard web pages matching the unified YouTube-style design.
   * Updates the streamList DOM container with styled stream cards.
   */
  renderStandardStreams() {
    const list = this.elements.streamList;
    list.innerHTML = '';

    if (this.filteredStreams.length === 0) {
      this.elements.emptyState.classList.add('empty-state--visible');
      return;
    }

    this.elements.emptyState.classList.remove('empty-state--visible');

    this.filteredStreams.forEach((stream, index) => {
      const card = document.createElement('div');
      card.className = 'stream-card';

      // Clean resolution title
      let titleLabel = stream.resolution;
      if (!titleLabel) {
        if (stream.type === 'hls' || stream.type === 'dash') {
          titleLabel = 'Adaptive';
        } else {
          titleLabel = 'Direct Stream';
        }
      }

      // Build mini badges
      const badges = [];
      if (stream.fps) {
        badges.push(`<span class="mini-badge mini-badge--fps">${this.viewManager.escapeHtml(stream.fps)}</span>`);
      }
      if (stream.codec) {
        badges.push(`<span class="mini-badge mini-badge--codec">${this.viewManager.escapeHtml(stream.codec)}</span>`);
      }
      if (stream.ext) {
        badges.push(`<span class="mini-badge mini-badge--ext">${this.viewManager.escapeHtml(stream.ext)}</span>`);
      }
      if (stream.type) {
        badges.push(`<span class="mini-badge mini-badge--type">${this.viewManager.escapeHtml(stream.type.toUpperCase())}</span>`);
      }

      const badgesHtml = badges.join('');

      card.innerHTML = `
        <div class="stream-card__top">
          <div class="stream-card__header">
            <span class="stream-card__res">${this.viewManager.escapeHtml(titleLabel)}</span>
            <div class="badge-group">${badgesHtml}</div>
          </div>
          <div class="stream-card__actions">
            <button class="icon-btn icon-btn--primary btn-dl" title="${t('download', this.currentLanguage)}">
              <img src="svg/download.svg" alt="Download" class="icon-btn__img" />
            </button>
            <button class="icon-btn icon-btn--secondary btn-cp" title="${t('copy', this.currentLanguage)}">
              <img src="svg/copy.svg" alt="Kopiëren" class="icon-btn__img" />
            </button>
          </div>
        </div>
        <div class="stream-card__title">${this.viewManager.escapeHtml(stream.title || 'Video Stream')}</div>
        <div class="stream-card__url">${this.viewManager.escapeHtml(stream.url)}</div>
      `;

      card.querySelector('.btn-dl').onclick = () => this.startStandardDownload(stream);
      card.querySelector('.btn-cp').onclick = () => {
        navigator.clipboard.writeText(stream.url);
        this.showToast(t('copied_toast', this.currentLanguage));
      };

      list.appendChild(card);
    });
  }

  /**
   * Filters streams in standard mode.
   * @param {string} query
   */
  filterStreams(query) {
    if (!query) {
      this.filteredStreams = [...this.streams];
    } else {
      this.filteredStreams = this.streams.filter((s) => {
        return (s.title || '').toLowerCase().includes(query) || s.url.toLowerCase().includes(query) || s.type.toLowerCase().includes(query);
      });
    }
    this.renderStandardStreams();
  }

  /**
   * Starts downloading via the local helper server.
   */
  async startHelperDownload(url, type, item, title) {
    const params = {
      url: url,
      type: type,
      height: item.height || null,
      abr: item.abr || null,
      lang: item.lang || null,
      title: title || 'video'
    };

    try {
      this.showProgress('Download starten...', 0);
      const taskId = await this.helperBridge.startDownload(params);

      this.stopPolling = this.helperBridge.pollStatus(
        taskId,
        (prog) => {
          const speedText = prog.speed ? `${prog.speed} - ETA ${prog.eta}` : '';
          this.showProgress(`Downloaden: ${prog.percent.toFixed(1)}%`, prog.percent, speedText);
        },
        (done) => {
          this.hideProgress();
          this.showToast(`Download voltooid: ${done.filename}`);
        },
        (err) => {
          this.hideProgress();
          this.showToast(`Fout: ${err.message}`);
        }
      );
    } catch (err) {
      this.hideProgress();
      this.showToast(`Fout: ${err.message}`);
    }
  }

  /**
   * Starts in-browser HLS or direct download for standard streaming sites and updates progress.
   * Controls active download abort signal and dispatches UI progress updates.
   * @param {Object} stream - Stream object { url, type, title }
   */
  async startStandardDownload(stream) {
    const rawTitle = (stream.title || 'video').replace(/[/\\?%*:|"<>]/g, '_').trim();

    if (stream.type === 'hls') {
      this.activeAbortController = new AbortController();
      this.showProgress('Voorbereiden...', 0, '');

      try {
        await HLSDownloaderEngine.downloadAndMergeHLS(
          stream.url,
          rawTitle,
          (p) => this.showProgress(p.status, p.percent, p.speed || ''),
          this.activeAbortController.signal
        );
        this.showToast('Download voltooid!');
        setTimeout(() => this.hideProgress(), 2500);
      } catch (err) {
        this.hideProgress();
        this.showToast(`Fout: ${err.message}`);
      }
    } else {
      chrome.runtime.sendMessage(
        { action: 'DOWNLOAD_DIRECT', url: stream.url, filename: `${rawTitle}.mp4` },
        (res) => {
          if (res && res.success) {
            this.showToast('Download gestart via browser!');
          } else {
            window.open(stream.url, '_blank');
          }
        }
      );
    }
  }

  /**
   * Handles manual URL download.
   */
  async handleManualDownload() {
    const url = this.elements.manualUrlInput.value.trim();
    if (!url) return;
    this.elements.manualUrlInput.value = '';

    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    if (isYouTube) {
      await this.handleYouTubeTab(url);
    } else {
      this.startStandardDownload({ url: url, type: url.includes('.m3u8') ? 'hls' : 'direct', title: 'Video' });
    }
  }

  /**
   * Clears tab streams.
   */
  handleClearStreams() {
    if (!this.activeTab) return;
    chrome.runtime.sendMessage({ action: 'CLEAR_TAB_STREAMS', tabId: this.activeTab.id }, () => {
      this.streams = [];
      this.filteredStreams = [];
      this.renderStandardStreams();
      this.showToast(t('list_cleared', this.currentLanguage));
    });
  }

  /**
   * Progress card update for active downloads.
   */
  showProgress(status, percent, speed = '', isIndeterminate = false) {
    this.elements.progressSection.classList.remove('progress-card--hidden');
    this.elements.progressStatusLabel.textContent = status;

    if (isIndeterminate || percent === null || percent === undefined) {
      this.elements.progressPercentLabel.textContent = '...';
      this.elements.progressBarFill.classList.add('progress-bar-fill--indeterminate');
      this.elements.progressBarFill.style.width = '100%';
    } else {
      this.elements.progressBarFill.classList.remove('progress-bar-fill--indeterminate');
      this.elements.progressPercentLabel.textContent = `${Math.round(percent)}%`;
      this.elements.progressBarFill.style.width = `${percent}%`;
    }

    this.elements.progressSpeedLabel.textContent = speed;
  }

  hideProgress() {
    this.elements.progressSection.classList.add('progress-card--hidden');
    this.elements.progressBarFill.classList.remove('progress-bar-fill--indeterminate');
    this.elements.progressBarFill.style.width = '0%';
    this.elements.progressSpeedLabel.textContent = '';
  }

  cancelActiveDownload() {
    if (this.stopPolling) {
      this.stopPolling();
      this.stopPolling = null;
    }
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.hideProgress();
    this.showToast(t('download_cancelled', this.currentLanguage));
  }

  showToast(msg) {
    this.elements.toast.textContent = msg;
    this.elements.toast.classList.remove('toast--hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.elements.toast.classList.add('toast--hidden'), 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupOrchestrator();
});
