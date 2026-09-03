/**
 * @file view-manager.js
 * @description OOP View Manager rendering minimalist categorized downloads, setup banners, and stream lists.
 */

export class ViewManager {
  constructor(elements) {
    this.elements = elements;
    this.activeCategory = 'video'; // 'video' | 'audio' | 'subtitles'
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

    if (isHelperOnline) {
      this.elements.helperStatusPill.className = 'status-pill status-pill--online';
      this.elements.helperStatusPill.textContent = '● Helper Actief';
    } else {
      this.elements.helperStatusPill.className = 'status-pill status-pill--offline';
      this.elements.helperStatusPill.textContent = '○ Helper Offline';
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

    // Tab buttons
    this.elements.tabVideoBtn.innerHTML = `<span>Video</span><span class="tab-badge">${videoList.length}</span>`;
    this.elements.tabAudioBtn.innerHTML = `<span>Audio</span><span class="tab-badge">${audioList.length}</span>`;
    this.elements.tabSubBtn.innerHTML = `<span>Ondertitels</span><span class="tab-badge">${subList.length}</span>`;

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
   * Renders list of items for the currently active category.
   */
  renderActiveCategoryList(data, onDownload) {
    const listEl = this.elements.categoryList;
    listEl.innerHTML = '';

    if (this.activeCategory === 'video') {
      const items = data.video || [];
      if (items.length === 0) {
        listEl.innerHTML = `<div class="empty-hint">Geen videokwaliteiten gedetecteerd.</div>`;
        return;
      }

      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'option-row';
        row.innerHTML = `
          <div class="option-row__info">
            <span class="option-row__label">${this.escapeHtml(item.label || `${item.height}p`)}</span>
          </div>
          <button class="pill-btn pill-btn--primary">
            <img src="svg/download.svg" alt="Download" class="pill-btn__img" />
            <span>Download</span>
          </button>
        `;
        row.querySelector('button').onclick = () => onDownload('video', item);
        listEl.appendChild(row);
      });

    } else if (this.activeCategory === 'audio') {
      const items = data.audio || [];
      if (items.length === 0) {
        listEl.innerHTML = `<div class="empty-hint">Geen audiotracks gedetecteerd.</div>`;
        return;
      }

      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'option-row';
        row.innerHTML = `
          <div class="option-row__info">
            <span class="option-row__label">${this.escapeHtml(item.label || `${item.abr} kbps`)}</span>
          </div>
          <button class="pill-btn pill-btn--primary">
            <img src="svg/download.svg" alt="Download" class="pill-btn__img" />
            <span>Download</span>
          </button>
        `;
        row.querySelector('button').onclick = () => onDownload('audio', item);
        listEl.appendChild(row);
      });

    } else if (this.activeCategory === 'subtitles') {
      const items = data.subtitles || [];
      if (items.length === 0) {
        listEl.innerHTML = `<div class="empty-hint">Geen ondertitels beschikbaar voor deze video.</div>`;
        return;
      }

      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'option-row';
        row.innerHTML = `
          <div class="option-row__info">
            <span class="option-row__label">${this.escapeHtml(item.name || item.lang.toUpperCase())}</span>
          </div>
          <button class="pill-btn pill-btn--primary">
            <img src="svg/download.svg" alt="Download" class="pill-btn__img" />
            <span>Download</span>
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
