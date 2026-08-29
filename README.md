# Any Video Downloader (Manifest V3 + Portable Helper)

A modern, high-performance browser extension (Chrome / Edge / Brave) and portable helper engine for detecting, sniffing, and downloading video streams, HLS playlists (`.m3u8`), DASH (`.mpd`), direct MP4 files, and YouTube in **1080p, 4K, MP3 audio, and Subtitles (.srt)**.

---

## Features

- **Browser-Level Network Sniffing**: Uses `chrome.webRequest` in Manifest V3 to intercept media streams across all tabs and nested iframes.
- **In-Browser HLS Engine**: Automatically downloads, decrypts (AES-128 CBC), and merges `.m3u8` segments directly inside the browser.
- **YouTube 1080p / 4K / MP3 Support**: Zero-configuration portable helper server (`helper/`) using `yt-dlp` and `ffmpeg` to merge separate DASH video and audio tracks with 100% audio sync.
- **Dynamic Category Separation**:
  - **Video**: Shows only resolutions actually available for the video (e.g. `2160p (4K)`, `1440p`, `1080p`, `720p`, `480p`, `360p`).
  - **Audio**: Shows pure clean bitrates (`320 kbps`, `256 kbps`, `192 kbps`, `128 kbps`).
  - **Subtitles**: Shows available subtitle languages (`Nederlands`, `English`, `Français`, etc.) with `.srt` downloads.
- **Minimalist Aesthetic**: Pure monochrome dark and light mode UI with green Download and red Delete buttons.
- **100% Portable**: Helper runs on any Windows computer or USB drive without complex installation.

---

## Project Structure

```
EXTENSIONS/
├── any video downloader/
│   ├── manifest.json            # Manifest V3 extension configuration
│   ├── popup.html               # Minimalist popup UI
│   ├── css/
│   │   └── popup.css            # Dark & light mode OOCSS stylesheet
│   ├── js/
│   │   ├── background.js        # Background service worker & network sniffer
│   │   ├── content.js           # DOM scanner for video/source tags
│   │   ├── injected.js          # In-page fetch/XHR stream interceptor
│   │   ├── hls-downloader.js    # In-browser HLS playlist parser & AES decryptor
│   │   ├── helper-bridge.js     # HTTP client bridge for local helper
│   │   ├── helper-bundle.js     # In-extension 1-click helper installer
│   │   ├── theme-manager.js     # Dark/Light mode manager
│   │   ├── view-manager.js      # Dynamic category view renderer
│   │   └── popup.js             # Main OOP popup orchestrator
│   ├── helper/
│   │   ├── server.py            # Zero-dependency local Python HTTP daemon
│   │   ├── start_helper.bat     # Portable 1-click Windows launcher
│   │   └── README.txt           # Helper setup guide
│   └── svg/                     # Standalone vector icons
├── .gitignore
└── README.md
```

---

## Installation & Setup

### 1. Load Extension in Browser (Chrome / Edge / Brave)
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** (*Uitgepakte extensie laden*).
4. Select the folder: `any video downloader`.

### 2. YouTube & 4K Helper (Optional, for YouTube 1080p/4K/MP3)
- When on YouTube, click **Download Helper (.bat)** in the popup (or open `any video downloader/helper/`).
- Double-click `start_helper.bat`.
- The popup will automatically connect and unlock 1080p, 4K, and MP3 downloads directly to your `Downloads` folder!

---

## License
MIT License
