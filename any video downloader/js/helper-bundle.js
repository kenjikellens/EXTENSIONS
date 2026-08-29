/**
 * @file helper-bundle.js
 * @description Directly triggers the standalone AnyVideoDownloaderHelper.exe download from the extension.
 */

export class HelperPackageBuilder {
  /**
   * Triggers direct browser download of the standalone AnyVideoDownloaderHelper.exe binary.
   * @returns {Promise<void>}
   */
  static downloadHelperPackage() {
    return new Promise((resolve, reject) => {
      try {
        const exeUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
          ? chrome.runtime.getURL('helper/AnyVideoDownloaderHelper.exe')
          : 'helper/AnyVideoDownloaderHelper.exe';

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
                this._fallbackAnchorDownload(exeUrl);
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
