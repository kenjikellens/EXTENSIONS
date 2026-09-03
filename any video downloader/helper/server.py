"""
server.py - Zero-Dependency Local Helper Daemon for Any Video Downloader.
Handles YouTube video format extraction, audio extraction, subtitle extraction, and ffmpeg muxing.
Runs locally on http://127.0.0.1:48921 using Python's standard library.
"""

import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

# Server configuration
PORT = 48921
HOST = '127.0.0.1'

# Global dictionary tracking active and completed background download tasks
active_tasks = {}
tasks_lock = threading.Lock()

# Logging callback registry for GUI updates
_gui_log_callbacks = []
_gui_callbacks_lock = threading.Lock()


def register_log_callback(callback):
    """Registers a listener function for realtime server event logs."""
    with _gui_callbacks_lock:
        if callback not in _gui_log_callbacks:
            _gui_log_callbacks.append(callback)


def unregister_log_callback(callback):
    """Unregisters a listener function."""
    with _gui_callbacks_lock:
        if callback in _gui_log_callbacks:
            _gui_log_callbacks.remove(callback)


def broadcast_log(msg):
    """
    Broadcasts an event log line safely to registered UI listeners and standard output without encoding errors.
    Affects server console logging, GUI activity log text widget, and UI listener callbacks.
    """
    timestamp = time.strftime("[%H:%M:%S]")
    line = f"{timestamp} {msg}"
    try:
        if sys.stdout and hasattr(sys.stdout, 'buffer'):
            sys.stdout.buffer.write(f"{line}\n".encode('utf-8', errors='replace'))
            sys.stdout.flush()
        else:
            print(line.encode('ascii', errors='replace').decode('ascii'))
    except Exception:
        pass

    with _gui_callbacks_lock:
        for cb in _gui_log_callbacks:
            try:
                cb(line)
            except Exception:
                pass


class ToolResolver:
    """
    Resolves executable paths for yt-dlp and ffmpeg, preferring local folder binaries.
    """

    _download_lock = threading.Lock()

    @staticmethod
    def get_base_dir():
        """
        Returns the root application directory whether running as a script or a frozen PyInstaller bundle.
        Affects directory resolution for embedded binaries and config files.
        """
        if getattr(sys, 'frozen', False):
            return Path(sys.executable).parent.resolve()
        return Path(__file__).parent.resolve()

    @classmethod
    def get_binary_path(cls, name):
        """
        Locates the requested executable binary across local directories, user Python scripts, and system PATH.
        Affects binary resolution for external processes like yt-dlp and ffmpeg.
        """
        base_dir = cls.get_base_dir()
        local_exe = base_dir / f"{name}.exe"
        if local_exe.exists():
            return str(local_exe)

        # Check script parent directory as well if different from base_dir
        script_exe = Path(__file__).parent.resolve() / f"{name}.exe"
        if script_exe.exists():
            return str(script_exe)

        # Check subfolder bin/
        bin_sub = base_dir / "bin" / f"{name}.exe"
        if bin_sub.exists():
            return str(bin_sub)

        # Check system PATH
        which_path = shutil.which(name) or shutil.which(f"{name}.exe")
        if which_path:
            return which_path

        # Windows py-installed yt-dlp fallback in Python Scripts directories
        if name == 'yt-dlp':
            candidates = [
                Path(sys.prefix) / "Scripts" / "yt-dlp.exe",
                Path(sys.base_prefix) / "Scripts" / "yt-dlp.exe",
            ]
            local_appdata = os.environ.get('LOCALAPPDATA')
            if local_appdata:
                candidates.append(Path(local_appdata) / "Programs" / "Python" / "Python313" / "Scripts" / "yt-dlp.exe")
                candidates.append(Path(local_appdata) / "Programs" / "Python" / "Python310" / "Scripts" / "yt-dlp.exe")
                candidates.append(Path(local_appdata) / "AnyVideoDownloader" / "yt-dlp.exe")
            appdata = os.environ.get('APPDATA')
            if appdata:
                candidates.append(Path(appdata) / "Python" / "Python313" / "Scripts" / "yt-dlp.exe")
                candidates.append(Path(appdata) / "Python" / "Python310" / "Scripts" / "yt-dlp.exe")

            for cand in candidates:
                if cand.exists():
                    return str(cand)

        return None

    @classmethod
    def ensure_ytdlp(cls):
        """
        Verifies yt-dlp is available or downloads it automatically from official releases.
        Affects the availability of yt-dlp executable for extraction and download operations.
        """
        existing = cls.get_binary_path('yt-dlp')
        if existing:
            return existing

        with cls._download_lock:
            # Re-check inside lock
            existing = cls.get_binary_path('yt-dlp')
            if existing:
                return existing

            base_dir = cls.get_base_dir()
            target_path = base_dir / ('yt-dlp.exe' if os.name == 'nt' else 'yt-dlp')

            # Ensure writable directory
            try:
                test_file = base_dir / '.write_test'
                test_file.touch()
                test_file.unlink()
            except Exception:
                appdata = os.environ.get('LOCALAPPDATA', str(Path.home()))
                target_dir = Path(appdata) / 'AnyVideoDownloader'
                target_dir.mkdir(parents=True, exist_ok=True)
                target_path = target_dir / ('yt-dlp.exe' if os.name == 'nt' else 'yt-dlp')

            broadcast_log("yt-dlp ontbreekt. Bezig met automatisch downloaden van de nieuwste versie...")
            download_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" if os.name == 'nt' else "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"

            temp_target = target_path.with_suffix('.tmp')
            try:
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                req = urllib.request.Request(download_url, headers=headers)
                with urllib.request.urlopen(req, timeout=60) as resp, open(temp_target, 'wb') as out_f:
                    shutil.copyfileobj(resp, out_f)

                if os.name != 'nt':
                    os.chmod(temp_target, 0o755)

                if target_path.exists():
                    try:
                        target_path.unlink()
                    except Exception:
                        pass
                temp_target.rename(target_path)
                broadcast_log("✓ yt-dlp succesvol automatisch gedownload en gereed voor gebruik!")
                return str(target_path)
            except Exception as exc:
                if temp_target.exists():
                    try:
                        temp_target.unlink()
                    except Exception:
                        pass
                broadcast_log(f"✗ Automatisch downloaden van yt-dlp mislukt: {exc}")
                return None

    @classmethod
    def get_ytdlp(cls):
        """
        Retrieves the yt-dlp executable path, attempting auto-download if not yet present.
        Affects video format analysis and video/audio download execution.
        """
        return cls.get_binary_path('yt-dlp') or cls.ensure_ytdlp()

    @classmethod
    def get_ffmpeg_dir(cls):
        """
        Returns the directory containing ffmpeg binaries for audio/video muxing.
        Affects ffmpeg-location parameter configuration for yt-dlp commands.
        """
        ffmpeg_bin = cls.get_binary_path('ffmpeg')
        if ffmpeg_bin:
            return str(Path(ffmpeg_bin).parent)
        return None


class FormatExtractor:
    """
    Extracts only the actual available resolutions, audio bitrates, and subtitle tracks from video metadata.
    """

    @staticmethod
    def parse_metadata(info_dict):
        """
        Parses raw yt-dlp JSON dictionary into clean, deduplicated available options.
        """
        title = info_dict.get('title', 'Video')
        thumbnail = info_dict.get('thumbnail', '')
        duration = info_dict.get('duration', 0)
        webpage_url = info_dict.get('webpage_url', '')

        formats = info_dict.get('formats', [])

        # 1. Extract distinct available video resolutions
        available_heights = set()
        for f in formats:
            h = f.get('height')
            if h and isinstance(h, int) and h >= 144:
                available_heights.add(h)

        sorted_heights = sorted(list(available_heights), reverse=True)
        video_options = []
        for h in sorted_heights:
            label = f"{h}p (4K)" if h >= 2160 else f"{h}p"
            video_options.append({"height": h, "label": label})

        # 2. Extract available audio bitrates for MP3 conversion
        # Includes full standard spectrum: 320, 256, 192, 128, 96, 64 kbps
        standard_tiers = [320, 256, 192, 128, 96, 64]
        audio_options = [{"abr": tier, "label": f"{tier} kbps"} for tier in standard_tiers]

        # 3. Extract available subtitles
        subtitles_dict = info_dict.get('subtitles', {})
        auto_captions = info_dict.get('automatic_captions', {})
        all_subs = {**auto_captions, **subtitles_dict}

        subtitle_options = []
        for lang_code in all_subs.keys():
            name = lang_code.upper()
            if lang_code == 'nl':
                name = 'Nederlands'
            elif lang_code == 'en':
                name = 'English'
            elif lang_code == 'fr':
                name = 'Français'
            elif lang_code == 'de':
                name = 'Deutsch'
            elif lang_code == 'es':
                name = 'Español'

            subtitle_options.append({"lang": lang_code, "name": name})

        # Sort subtitles so standard languages appear first
        subtitle_options.sort(key=lambda s: (s['lang'] not in ['nl', 'en', 'de', 'fr', 'es'], s['name']))

        return {
            "title": title,
            "thumbnail": thumbnail,
            "duration": duration,
            "url": webpage_url,
            "video": video_options,
            "audio": audio_options,
            "subtitles": subtitle_options[:15]  # Limit to top 15 relevant languages
        }


class DownloadManager:
    """
    Executes yt-dlp in a background thread and tracks real-time progress.
    """

    @staticmethod
    def start_task(params):
        task_id = f"task_{int(time.time())}_{os.urandom(3).hex()}"
        with tasks_lock:
            active_tasks[task_id] = {
                "id": task_id,
                "status": "starting",
                "percent": 0,
                "speed": "",
                "eta": "",
                "filename": "",
                "error": None
            }

        thread = threading.Thread(target=DownloadManager._run_download, args=(task_id, params), daemon=True)
        thread.start()
        return task_id

    @staticmethod
    def _run_download(task_id, params):
        """
        Executes a background yt-dlp download process, streaming progress and errors to the active_tasks store.
        Affects active_tasks status, progress percentages, and GUI log broadcasting.
        """
        url = params.get('url')
        dl_type = params.get('type', 'video')  # 'video' | 'audio' | 'subtitle'
        height = params.get('height')
        abr = params.get('abr', 320)
        lang = params.get('lang', 'en')

        ytdlp_bin = ToolResolver.get_ytdlp()
        if not ytdlp_bin or not Path(ytdlp_bin).exists():
            with tasks_lock:
                active_tasks[task_id]["status"] = "error"
                active_tasks[task_id]["error"] = "yt-dlp.exe ontbreekt en kon niet automatisch worden opgehaald."
            broadcast_log("✗ Download afgebroken: yt-dlp.exe ontbreekt")
            return

        downloads_dir = str(Path.home() / 'Downloads')
        output_template = os.path.join(downloads_dir, '%(title)s.%(ext)s')

        ytdlp_cmd = [ytdlp_bin, '--newline', '--no-playlist']

        ffmpeg_dir = ToolResolver.get_ffmpeg_dir()
        if ffmpeg_dir:
            ytdlp_cmd.extend(['--ffmpeg-location', ffmpeg_dir])

        if dl_type == 'video':
            if height:
                fmt = f"bestvideo[height<={height}]+bestaudio/best[height<={height}]/best"
            else:
                fmt = "bestvideo+bestaudio/best"
            ytdlp_cmd.extend(['-f', fmt, '--merge-output-format', 'mp4'])
            broadcast_log(f"Download gestart (Video {height or 'best'}p): {url}")

        elif dl_type == 'audio':
            ytdlp_cmd.extend(['-x', '--audio-format', 'mp3', '--audio-quality', f"{abr}k"])
            broadcast_log(f"Download gestart (Audio {abr} kbps MP3): {url}")

        elif dl_type == 'subtitle':
            ytdlp_cmd.extend([
                '--skip-download',
                '--write-sub',
                '--write-auto-sub',
                '--sub-lang', lang,
                '--convert-subs', 'srt'
            ])
            broadcast_log(f"Download gestart (Ondertitels [{lang}]): {url}")

        ytdlp_cmd.extend(['-o', output_template, url])

        try:
            with tasks_lock:
                active_tasks[task_id]["status"] = "downloading"

            process = subprocess.Popen(
                ytdlp_cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )

            progress_regex = re.compile(r'\[download\]\s+(\d+\.?\d*)%\s+of\s+~?(\S+)\s+at\s+(\S+)\s+ETA\s+(\S+)')
            dest_regex = re.compile(r'\[(?:download|Merger|ExtractAudio)\]\s+Destination:\s+(.+)')

            for line in process.stdout:
                line_str = line.strip()

                dest_match = dest_regex.search(line_str)
                if dest_match:
                    fn = os.path.basename(dest_match.group(1))
                    with tasks_lock:
                        active_tasks[task_id]["filename"] = fn
                    broadcast_log(f"Bestand: {fn}")

                prog_match = progress_regex.search(line_str)
                if prog_match:
                    percent = float(prog_match.group(1))
                    speed = prog_match.group(3)
                    eta = prog_match.group(4)
                    with tasks_lock:
                        active_tasks[task_id]["percent"] = percent
                        active_tasks[task_id]["speed"] = speed
                        active_tasks[task_id]["eta"] = eta

            process.wait()

            with tasks_lock:
                if process.returncode == 0:
                    active_tasks[task_id]["status"] = "completed"
                    active_tasks[task_id]["percent"] = 100
                    broadcast_log(f"✓ Download voltooid: {active_tasks[task_id].get('filename', url)}")
                else:
                    active_tasks[task_id]["status"] = "error"
                    active_tasks[task_id]["error"] = f"yt-dlp foutcode {process.returncode}"
                    broadcast_log(f"✗ Fout bij downloaden (Code {process.returncode})")

        except FileNotFoundError:
            with tasks_lock:
                active_tasks[task_id]["status"] = "error"
                active_tasks[task_id]["error"] = "yt-dlp uitvoerbaar bestand niet gevonden op het systeem."
            broadcast_log("✗ Fout: yt-dlp uitvoerbaar bestand niet gevonden.")
        except Exception as exc:
            with tasks_lock:
                active_tasks[task_id]["status"] = "error"
                active_tasks[task_id]["error"] = str(exc)
            broadcast_log(f"✗ Uitzondering: {exc}")


class HelperHTTPRequestHandler(http.server.BaseHTTPRequestHandler):
    """
    HTTP Request Handler with full CORS and JSON API endpoints.
    """

    def _set_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def _send_json(self, data, status=200):
        response_bytes = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self._set_cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(response_bytes)))
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_GET(self):
        """
        Handles incoming GET requests for health check, video metadata extraction, and task status polling.
        Affects HTTP response payloads, log callbacks, and background task queries.
        """
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Healthcheck
        if path == '/ping':
            has_ytdlp = bool(ToolResolver.get_binary_path('yt-dlp'))
            if not has_ytdlp:
                # Proactively trigger auto-download in background thread if not ready
                threading.Thread(target=ToolResolver.ensure_ytdlp, daemon=True).start()

            self._send_json({
                "status": "ok",
                "version": "2.1.0",
                "ytdlp": has_ytdlp,
                "ffmpeg": bool(ToolResolver.get_binary_path('ffmpeg'))
            })
            return

        # Video metadata extraction
        if path == '/info':
            target_url = query.get('url', [''])[0]
            if not target_url:
                self._send_json({"error": "Geen URL meegegeven"}, 400)
                return

            broadcast_log(f"Video metadata opvragen: {target_url}")
            ytdlp_bin = ToolResolver.get_ytdlp()
            if not ytdlp_bin or not Path(ytdlp_bin).exists():
                broadcast_log("✗ yt-dlp.exe ontbreekt en kon niet worden geladen.")
                self._send_json({"error": "yt-dlp.exe ontbreekt en kon niet automatisch worden opgehaald. Controleer je internetverbinding."}, 500)
                return

            try:
                cmd = [ytdlp_bin, '-J', '--no-playlist', target_url]
                res = subprocess.run(
                    cmd,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                )

                if res.returncode != 0:
                    broadcast_log(f"✗ Info ophalen mislukt voor: {target_url}")
                    self._send_json({"error": res.stderr or "Kon video info niet ophalen"}, 500)
                    return

                info_dict = json.loads(res.stdout)
                cleaned = FormatExtractor.parse_metadata(info_dict)
                broadcast_log(f"✓ Metadata succesvol geladen: {cleaned.get('title', 'Video')}")
                self._send_json({"success": True, "data": cleaned})
            except FileNotFoundError:
                broadcast_log("✗ yt-dlp uitvoerbaar bestand niet gevonden.")
                self._send_json({"error": "yt-dlp uitvoerbaar bestand niet gevonden op het systeem."}, 500)
            except Exception as e:
                broadcast_log(f"✗ Fout bij verwerken info: {e}")
                self._send_json({"error": str(e)}, 500)
            return

        # Task status polling
        if path == '/status':
            task_id = query.get('id', [''])[0]
            with tasks_lock:
                task = active_tasks.get(task_id)
            if task:
                self._send_json(task)
            else:
                self._send_json({"error": "Taak niet gevonden"}, 404)
            return

        self._send_json({"error": "Endpoint niet gevonden"}, 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/download':
            content_length = int(self.headers.get('Content-Length', 0))
            body_data = self.rfile.read(content_length)
            try:
                params = json.loads(body_data.decode('utf-8'))
                task_id = DownloadManager.start_task(params)
                self._send_json({"success": True, "taskId": task_id})
            except Exception as e:
                self._send_json({"error": str(e)}, 400)
            return

        self._send_json({"error": "Endpoint niet gevonden"}, 404)

    def log_message(self, format, *args):
        # Keep daemon console output clean
        pass


class DaemonServerManager:
    """
    Manages the lifecycle of the ThreadingHTTPServer daemon.
    Allows clean start, stop, and status querying.
    """

    _httpd = None
    _thread = None
    _is_running = False
    _lock = threading.Lock()

    @classmethod
    def start(cls):
        """
        Initializes and starts the HTTP daemon server in a background thread with socket reuse and retry support.
        Affects the HTTP listener lifecycle, port binding state, and active server flag.
        """
        with cls._lock:
            if cls._is_running:
                return True

            for attempt in range(5):
                try:
                    http.server.ThreadingHTTPServer.allow_reuse_address = True
                    cls._httpd = http.server.ThreadingHTTPServer((HOST, PORT), HelperHTTPRequestHandler)
                    cls._is_running = True
                    cls._thread = threading.Thread(target=cls._httpd.serve_forever, daemon=True)
                    cls._thread.start()
                    broadcast_log(f"Server succesvol gestart op http://{HOST}:{PORT}")
                    return True
                except OSError as exc:
                    if attempt < 4:
                        time.sleep(1)
                        continue
                    broadcast_log(f"✗ Kon server niet starten: {exc}")
                    cls._is_running = False
                    return False
                except Exception as exc:
                    broadcast_log(f"✗ Kon server niet starten: {exc}")
                    cls._is_running = False
                    return False

    @classmethod
    def stop(cls):
        with cls._lock:
            if not cls._is_running or not cls._httpd:
                return True

            try:
                cls._httpd.shutdown()
                cls._httpd.server_close()
                cls._is_running = False
                broadcast_log("Server gestopt.")
                return True
            except Exception as exc:
                broadcast_log(f"✗ Fout bij stoppen van server: {exc}")
                return False

    @classmethod
    def is_running(cls):
        with cls._lock:
            return cls._is_running


if __name__ == '__main__':
    DaemonServerManager.start()
    print(f"=== Any Video Downloader Helper ===")
    print(f"Server gestart op http://{HOST}:{PORT}")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        DaemonServerManager.stop()
        print("\nServer afgesloten.")
