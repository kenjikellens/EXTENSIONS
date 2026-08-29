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
from pathlib import Path

# Server configuration
PORT = 48921
HOST = '127.0.0.1'

# Global dictionary tracking active and completed background download tasks
active_tasks = {}
tasks_lock = threading.Lock()


class ToolResolver:
    """
    Resolves executable paths for yt-dlp and ffmpeg, preferring local folder binaries.
    """

    @staticmethod
    def get_binary_path(name):
        """
        Locates the binary either in the local script directory or in the system PATH.
        """
        script_dir = Path(__file__).parent.resolve()
        local_exe = script_dir / f"{name}.exe"
        if local_exe.exists():
            return str(local_exe)

        which_path = shutil.which(name)
        if which_path:
            return which_path

        # Windows py-installed yt-dlp fallback
        if name == 'yt-dlp':
            py_path = shutil.which('yt-dlp.exe')
            if py_path:
                return py_path

        return None

    @classmethod
    def get_ytdlp(cls):
        return cls.get_binary_path('yt-dlp') or 'yt-dlp'

    @classmethod
    def get_ffmpeg_dir(cls):
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

        # 2. Extract distinct available audio bitrates
        available_bitrates = set()
        for f in formats:
            abr = f.get('abr')
            if abr and isinstance(abr, (int, float)) and abr > 0:
                available_bitrates.add(int(abr))

        # Standard clean bitrate tiers up to max source bitrate
        standard_tiers = [320, 256, 192, 128, 64]
        max_source_abr = max(available_bitrates) if available_bitrates else 128
        audio_options = []
        for tier in standard_tiers:
            if tier <= max(max_source_abr, 128) or tier == 128 or tier == 320:
                audio_options.append({"abr": tier, "label": f"{tier} kbps"})

        if not audio_options:
            audio_options = [{"abr": 320, "label": "320 kbps"}, {"abr": 128, "label": "128 kbps"}]

        # 3. Extract available subtitles
        subtitles_dict = info_dict.get('subtitles', {})
        auto_captions = info_dict.get('automatic_captions', {})
        all_subs = {**auto_captions, **subtitles_dict}

        subtitle_options = []
        for lang_code, formats_list in all_subs.items():
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
        url = params.get('url')
        dl_type = params.get('type', 'video')  # 'video' | 'audio' | 'subtitle'
        height = params.get('height')
        abr = params.get('abr', 320)
        lang = params.get('lang', 'en')

        downloads_dir = str(Path.home() / 'Downloads')
        output_template = os.path.join(downloads_dir, '%(title)s.%(ext)s')

        ytdlp_cmd = [ToolResolver.get_ytdlp(), '--newline', '--no-playlist']

        ffmpeg_dir = ToolResolver.get_ffmpeg_dir()
        if ffmpeg_dir:
            ytdlp_cmd.extend(['--ffmpeg-location', ffmpeg_dir])

        if dl_type == 'video':
            if height:
                fmt = f"bestvideo[height<={height}]+bestaudio/best[height<={height}]/best"
            else:
                fmt = "bestvideo+bestaudio/best"
            ytdlp_cmd.extend(['-f', fmt, '--merge-output-format', 'mp4'])

        elif dl_type == 'audio':
            ytdlp_cmd.extend(['-x', '--audio-format', 'mp3', '--audio-quality', f"{abr}k"])

        elif dl_type == 'subtitle':
            ytdlp_cmd.extend([
                '--skip-download',
                '--write-sub',
                '--write-auto-sub',
                '--sub-lang', lang,
                '--convert-subs', 'srt'
            ])

        ytdlp_cmd.extend(['-o', output_template, url])

        try:
            with tasks_lock:
                active_tasks[task_id]["status"] = "downloading"

            process = subprocess.Popen(
                ytdlp_cmd,
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
                    with tasks_lock:
                        active_tasks[task_id]["filename"] = os.path.basename(dest_match.group(1))

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
                else:
                    active_tasks[task_id]["status"] = "error"
                    active_tasks[task_id]["error"] = f"yt-dlp afgesloten met foutcode {process.returncode}"

        except Exception as exc:
            with tasks_lock:
                active_tasks[task_id]["status"] = "error"
                active_tasks[task_id]["error"] = str(exc)


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
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Healthcheck
        if path == '/ping':
            self._send_json({
                "status": "ok",
                "version": "2.0.0",
                "ytdlp": bool(ToolResolver.get_binary_path('yt-dlp')),
                "ffmpeg": bool(ToolResolver.get_binary_path('ffmpeg'))
            })
            return

        # Video metadata extraction
        if path == '/info':
            target_url = query.get('url', [''])[0]
            if not target_url:
                self._send_json({"error": "Geen URL meegegeven"}, 400)
                return

            try:
                cmd = [ToolResolver.get_ytdlp(), '-J', '--no-playlist', target_url]
                res = subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                )

                if res.returncode != 0:
                    self._send_json({"error": res.stderr or "Kon video info niet ophalen"}, 500)
                    return

                info_dict = json.loads(res.stdout)
                cleaned = FormatExtractor.parse_metadata(info_dict)
                self._send_json({"success": True, "data": cleaned})
            except Exception as e:
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


def run_server():
    server_address = (HOST, PORT)
    httpd = http.server.ThreadingHTTPServer(server_address, HelperHTTPRequestHandler)
    print(f"=== Any Video Downloader Helper ===")
    print(f"Server gestart op http://{HOST}:{PORT}")
    print(f"Laat dit venster openstaan tijdens het downloaden.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer gestopt.")


if __name__ == '__main__':
    run_server()
