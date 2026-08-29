/**
 * @file theme-manager.js
 * @description Manages minimalist Dark / Light mode switching and persistence.
 */

export class ThemeManager {
  constructor(toggleBtnId = 'themeToggleBtn', toggleImgId = 'themeToggleImg') {
    this.toggleBtn = document.getElementById(toggleBtnId);
    this.toggleImg = document.getElementById(toggleImgId);
  }

  /**
   * Initializes theme preference from chrome.storage.local.
   */
  async init() {
    try {
      const data = await chrome.storage.local.get(['avd_theme']);
      const currentTheme = data.avd_theme || 'dark';
      this.apply(currentTheme);
    } catch {
      this.apply('dark');
    }

    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggleTheme());
    }
  }

  /**
   * Toggles theme between dark and light.
   * @returns {Promise<string>} New theme
   */
  async toggleTheme() {
    const isLight = document.body.classList.contains('theme-light');
    const newTheme = isLight ? 'dark' : 'light';
    this.apply(newTheme);

    try {
      await chrome.storage.local.set({ avd_theme: newTheme });
    } catch {
      // Storage write error
    }

    return newTheme;
  }

  /**
   * Applies the theme class and updates toggle button icon.
   * @param {'dark'|'light'} theme - Target theme
   */
  apply(theme) {
    if (theme === 'light') {
      document.body.classList.add('theme-light');
      if (this.toggleImg) {
        this.toggleImg.src = 'svg/moon.svg';
      }
      if (this.toggleBtn) {
        this.toggleBtn.title = 'Wissel naar Donker thema';
      }
    } else {
      document.body.classList.remove('theme-light');
      if (this.toggleImg) {
        this.toggleImg.src = 'svg/sun.svg';
      }
      if (this.toggleBtn) {
        this.toggleBtn.title = 'Wissel naar Licht thema';
      }
    }
  }
}
