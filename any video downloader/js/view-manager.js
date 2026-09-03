import { t, getLanguageDisplayName } from './i18n.js';

export class ViewManager {
  constructor(elements) {
    this.elements = elements;
    this.activeCategory = 'video'; // 'video' | 'audio' | 'subtitles'
    this.currentLang = 'nl';
  }

  /**
   * Updates current active language code.
   * @param {string} lang
   */
  setLanguage(lang) {
    this.currentLang = lang;
  }

  /**
   * Shows containerless fetching loader (spinner + "Fetching...") in stream area.
   */
  showFetching() {
    if (this.elements.fetchingState) {
      this.elements.fetchingState.classList.remove('fetching-state--hidden');
    }
    if (this.elements.emptyState) {
      this.elements.emptyState.classList.remove('empty-state--visible');
    }
    if (this.elements.streamList) {
      this.elements.streamList.style.display = 'none';
    }
  }

  /**
   * Hides containerless fetching loader.
   */
  hideFetching() {
    if (this.elements.fetchingState) {
      this.elements.fetchingState.classList.add('fetching-state--hidden');
    }
    if (this.elements.streamList) {
      this.elements.streamList.style.display = '';
    }
  }

  /**
   * Renders the video header with title, duration, and helper status badge.
   * @param {Object} info - Video metadata
   * @param {boolean} isHelperOnline - Helper daemon online status
   */
  renderVideoHeader(info, isHelperOnline) {
    if (!this.elements.videoInfoSection) return;

    this.elements.videoInfoSection.classList.remove('video-info-card--hidden');
    this.elements.videoTitleLabel.textContent = info.title || 'Video';

    if (info.thumbnail) {
      this.elements.videoThumbImg.src = info.thumbnail;
      this.elements.videoThumbImg.style.display = 'block';
    } else {
      this.elements.videoThumbImg.style.display = 'none';
    }

    if (info.duration) {
      const totalSecs = Math.floor(Number(info.duration) || 0);
      const hours = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = String(totalSecs % 60).padStart(2, '0');

      if (hours > 0) {
        this.elements.videoDurationLabel.textContent = `${hours}:${String(mins).padStart(2, '0')}:${secs}`;
      } else {
        this.elements.videoDurationLabel.textContent = `${mins}:${secs}`;
      }
      this.elements.videoDurationLabel.style.display = 'inline-block';
    } else {
      this.elements.videoDurationLabel.style.display = 'none';
    }
  }

  /**
   * Renders the categorized tabs (Video, Audio, Subtitles) with dynamic items.
   * @param {Object} data - { video: [], audio: [], subtitles: [] }
   * @param {Function} onDownload - Callback (type, item)
   */
  renderCategorizedOptions(data, onDownload) {
    if (!this.elements.categoryContainer) return;
    this.elements.categoryContainer.classList.remove('category-container--hidden');

    const videoList = data.video || [];
    const audioList = data.audio || [];
    const subList = data.subtitles || [];

    // Tab buttons with translated titles
    this.elements.tabVideoBtn.innerHTML = `<span>${t('tab_video', this.currentLang)}</span><span class="tab-badge">${videoList.length}</span>`;
    this.elements.tabAudioBtn.innerHTML = `<span>${t('tab_audio', this.currentLang)}</span><span class="tab-badge">${audioList.length}</span>`;
    this.elements.tabSubBtn.innerHTML = `<span>${t('tab_subtitles', this.currentLang)}</span><span class="tab-badge">${subList.length}</span>`;

    // Render active category list
    this.renderActiveCategoryList(data, onDownload);

    // Bind tab clicks
    this.elements.tabVideoBtn.onclick = () => {
      this.setActiveTab('video');
      this.renderActiveCategoryList(data, onDownload);
    };

    this.elements.tabAudioBtn.onclick = () => {
      this.setActiveTab('audio');
      this.renderActiveCategoryList(data, onDownload);
    };

    this.elements.tabSubBtn.onclick = () => {
      this.setActiveTab('subtitles');
      this.renderActiveCategoryList(data, onDownload);
    };
  }

  /**
   * Updates active tab styling.
   * @param {'video'|'audio'|'subtitles'} tabName
   */
  setActiveTab(tabName) {
    this.activeCategory = tabName;
    this.elements.tabVideoBtn.classList.toggle('tab-btn--active', tabName === 'video');
    this.elements.tabAudioBtn.classList.toggle('tab-btn--active', tabName === 'audio');
    this.elements.tabSubBtn.classList.toggle('tab-btn--active', tabName === 'subtitles');
  }

  /**
   * Renders media items for the active category (video, audio, subtitles) with title and mini metadata badges.
   * Updates the categoryList DOM element with interactive download rows.
   * @param {Object} data - Metadata object containing video, audio, and subtitle option arrays
   * @param {Function} onDownload - Callback invoked when a download button is triggered
   */
  renderActiveCategoryList(data, onDownload) {
    const listEl = this.elements.categoryList;
    listEl.innerHTML = '';

    const dlTitle = t('download', this.currentLang);

    if (this.activeCategory === 'video') {
      const items = data.video || [];
      if (items.length === 0) {
        listEl.innerHTML = `<div class="empty-hint">${t('empty_video', this.currentLang)}</div>`;
        return;
      }

      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'option-row';

        const badgesHtml = [
          item.fps ? `<span class="mini-badge mini-badge--fps">${this.escapeHtml(item.fps)}</span>` : '',
          item.codec ? `<span class="mini-badge mini-badge--codec">${this.escapeHtml(item.codec)}</span>` : '',
          `<span class="mini-badge mini-badge--ext">${this.escapeHtml(item.ext || 'mp4')}</span>`
        ].filter(Boolean).join('');

        row.innerHTML = `
          <div class="option-row__info">
            <span class="option-row__label">${this.escapeHtml(item.label || `${item.height}p`)}</span>
            <div class="badge-group">${badgesHtml}</div>
          </div>
          <button class="icon-btn icon-btn--primary" title="${dlTitle}">
            <img src="svg/download.svg" alt="Download" class="icon-btn__img" />
          </button>
        `;
        row.querySelector('button').onclick = () => onDownload('video', item);
        listEl.appendChild(row);
      });

    } else if (this.activeCategory === 'audio') {
      const items = data.audio || [];
      if (items.length === 0) {
        listEl.innerHTML = `<div class="empty-hint">${t('empty_audio', this.currentLang)}</div>`;
        return;
      }

      items.forEach((item) => {
        let label = item.label || `${item.abr} kbps`;
        if (item.lang) {
          const langName = getLanguageDisplayName(item.lang, this.currentLang);
          label = `${item.abr} kbps (${langName})`;
        }
        const row = document.createElement('div');
        row.className = 'option-row';
        row.innerHTML = `
          <div class="option-row__info">
            <span class="option-row__label">${this.escapeHtml(label)}</span>
            <div class="badge-group">
              <span class="mini-badge mini-badge--ext">${this.escapeHtml(item.ext || 'mp3')}</span>
            </div>
          </div>
          <button class="icon-btn icon-btn--primary" title="${dlTitle}">
            <img src="svg/download.svg" alt="Download" class="icon-btn__img" />
          </button>
        `;
        row.querySelector('button').onclick = () => onDownload('audio', item);
        listEl.appendChild(row);
      });

    } else if (this.activeCategory === 'subtitles') {
      const items = data.subtitles || [];
      if (items.length === 0) {
        listEl.innerHTML = `<div class="empty-hint">${t('empty_subtitles', this.currentLang)}</div>`;
        return;
      }

      // Sort subtitles: current language first, then alphabetically by translated name
      const sortedItems = [...items].sort((a, b) => {
        const aCode = (a.lang || '').toLowerCase();
        const bCode = (b.lang || '').toLowerCase();
        const aIsCurrent = aCode === this.currentLang || aCode.startsWith(this.currentLang + '-');
        const bIsCurrent = bCode === this.currentLang || bCode.startsWith(this.currentLang + '-');
        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;
        const aName = getLanguageDisplayName(aCode, this.currentLang);
        const bName = getLanguageDisplayName(bCode, this.currentLang);
        return aName.localeCompare(bName, this.currentLang);
      });

      sortedItems.forEach((item) => {
        const langCode = item.lang || '';
        const displayName = getLanguageDisplayName(langCode, this.currentLang) || item.name || langCode.toUpperCase();
        const row = document.createElement('div');
        row.className = 'option-row';
        row.innerHTML = `
          <div class="option-row__info">
            <span class="option-row__label">${this.escapeHtml(displayName)}</span>
            <div class="badge-group">
              <span class="mini-badge mini-badge--ext">${this.escapeHtml(item.ext || 'srt')}</span>
            </div>
          </div>
          <button class="icon-btn icon-btn--primary" title="${dlTitle}">
            <img src="svg/download.svg" alt="Download" class="icon-btn__img" />
          </button>
        `;
        row.querySelector('button').onclick = () => onDownload('subtitle', item);
        listEl.appendChild(row);
      });
    }
  }

  /**
   * Renders the setup guide banner when helper server is offline on YouTube.
   * @param {Function} onDownloadBundle - Callback to trigger helper bundle download
   */
  renderSetupBanner(onDownloadBundle) {
    if (!this.elements.setupBanner) return;
    this.elements.setupBanner.classList.remove('setup-banner--hidden');

    const dlBtn = this.elements.setupBanner.querySelector('#downloadHelperBtn');
    if (dlBtn) {
      dlBtn.onclick = () => onDownloadBundle();
    }
  }

  /**
   * Hides the setup guide banner.
   */
  hideSetupBanner() {
    if (this.elements.setupBanner) {
      this.elements.setupBanner.classList.add('setup-banner--hidden');
    }
  }

  /**
   * Utility escaping HTML characters.
   * @param {string} str - Raw string
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}
