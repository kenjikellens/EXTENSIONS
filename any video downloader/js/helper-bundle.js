/**
 * @file helper-bundle.js
 * @description Directly triggers the standalone AnyVideoDownloader.exe download from the extension.
 */

export class HelperPackageBuilder {
  /**
   * Triggers direct browser download of the standalone helper binary.
   * @returns {Promise<void>}
   */
  static async downloadHelperPackage() {
    try {
      const timestamp = Date.now();
      const localUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
        ? chrome.runtime.getURL(`helper/AnyVideoDownloaderHelper.exe?v=${timestamp}`)
        : `helper/AnyVideoDownloaderHelper.exe?v=${timestamp}`;

      const githubUrl = 'https://raw.githubusercontent.com/kenjikellens/EXTENSIONS/main/any%20video%20downloader/helper/AnyVideoDownloaderHelper.exe';

      let blobUrl = localUrl;
      try {
        const response = await fetch(localUrl);
        if (response.ok) {
          const blob = await response.blob();
          blobUrl = URL.createObjectURL(blob);
        }
      } catch {
        blobUrl = githubUrl;
      }

      if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
        chrome.downloads.download(
          {
            url: blobUrl,
            filename: 'AnyVideoDownloader.exe',
            saveAs: false,
            conflictAction: 'overwrite'
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              this._fallbackAnchorDownload(blobUrl);
            }
          }
        );
      } else {
        this._fallbackAnchorDownload(blobUrl);
      }
    } catch (err) {
      console.error('Download error:', err);
    }
  }

  /**
   * Fallback using standard anchor element.
   * @param {string} url - Target URL
   */
  static _fallbackAnchorDownload(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AnyVideoDownloader.exe';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
