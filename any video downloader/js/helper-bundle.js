/**
 * @file helper-bundle.js
 * @description Directly downloads the standalone AnyVideoDownloaderHelper.exe binary with genuine embedded icon.
 */

export class HelperPackageBuilder {
  /**
   * Triggers direct browser download of the standalone AnyVideoDownloaderHelper.exe binary.
   * @returns {Promise<void>}
   */
  static downloadHelperPackage() {
    return new Promise((resolve, reject) => {
      try {
        // Direct clean URL without invalid query parameters that break Chromium resource loading
        const exeUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
          ? chrome.runtime.getURL('helper/AnyVideoDownloaderHelper.exe')
          : 'https://raw.githubusercontent.com/kenjikellens/EXTENSIONS/main/any%20video%20downloader/helper/AnyVideoDownloaderHelper.exe';

        if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
          chrome.downloads.download(
            {
              url: exeUrl,
              filename: 'AnyVideoDownloaderHelper.exe',
              saveAs: false,
              conflictAction: 'overwrite'
            },
            (downloadId) => {
              if (chrome.runtime.lastError) {
                // Fallback to GitHub raw binary URL if local resource was locked
                const githubUrl = 'https://raw.githubusercontent.com/kenjikellens/EXTENSIONS/main/any%20video%20downloader/helper/AnyVideoDownloaderHelper.exe';
                this._fallbackAnchorDownload(githubUrl);
              }
              resolve();
            }
          );
        } else {
          this._fallbackAnchorDownload(exeUrl);
          resolve();
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Fallback using standard anchor element.
   * @param {string} url - Target URL
   */
  static _fallbackAnchorDownload(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AnyVideoDownloaderHelper.exe';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
