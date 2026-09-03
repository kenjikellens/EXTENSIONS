"""
app_gui.py - Sleek Minimalist GUI for Any Video Downloader Helper.
Provides a modern dark-mode control panel with an ON/OFF toggle switch, live status, and log ticker.
No black command line window.
"""

import json
import os
import shutil
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path
import tkinter as tk
from tkinter import messagebox

# Import the core daemon manager from server.py
from server import DaemonServerManager, ToolResolver, register_log_callback, unregister_log_callback, PORT, HOST

# Chrome Native Messaging Constants
NATIVE_HOST_NAME = "com.kenjigames.any_video_downloader"
EXTENSION_ID = "dobnkoiladafpdokalpkggcpkcallaei"


# Ensure Windows Taskbar links the window to Kenjigames app model ID
if os.name == 'nt':
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Kenjigames.AnyVideoDownloader.Helper.2.1")
    except Exception:
        pass


def get_resource_path(relative_path):
    """Gets absolute path to resource, works for dev and for PyInstaller bundle."""
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = Path(__file__).parent.resolve()
    return Path(base_path) / relative_path


class ModernHelperGUI:
    """
    Minimalist Dark-Mode Desktop GUI for Any Video Downloader Helper.
    """

    def __init__(self, root):
        """
        Initializes the ModernHelperGUI window, registers Native Messaging hosts, and starts background services.
        Affects main UI window creation, registry registration, and local HTTP server state.
        """
        self.root = root
        self.root.title("Any Video Downloader Helper")
        self.root.geometry("460x530")
        self.root.minsize(440, 480)
        self.root.configure(bg="#0b0f17")

        # Persistent icon references to prevent Python GC from dropping taskbar icon
        self.taskbar_icon = None
        self.header_icon_img = None

        # Set Window and Taskbar Icon
        self._set_window_icon()

        # Perform 1-click automatic installation and registry configuration
        is_outside_appdata = False
        try:
            target_dir = get_appdata_dir()
            appdata_exe = (target_dir / "AnyVideoDownloaderHelper.exe").resolve()
            cur_exe = Path(sys.executable).resolve() if getattr(sys, 'frozen', False) else Path(__file__).resolve()
            is_outside_appdata = (cur_exe != appdata_exe)
            install_host()
        except Exception:
            pass

        # Build UI Components
        self._create_header()
        self._create_status_card()
        self._create_log_console()
        self._create_footer_actions()

        # Connect logging callback
        register_log_callback(self._on_log_message)

        # Handle window close cleanly
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        # Auto-start server on launch
        self._start_server()
        self._ensure_dependencies_async()

        # Show prompt if launched as installer from outside %LOCALAPPDATA%
        if is_outside_appdata:
            self.root.after(300, self._show_installation_success)

    def _show_installation_success(self):
        """
        Displays a user-friendly confirmation dialog indicating that the helper has been permanently linked.
        Affects the Tkinter message box alert.
        """
        messagebox.showinfo(
            "Succesvol Gekoppeld aan Browser",
            "✓ Any Video Downloader Helper is succesvol geïnstalleerd en gekoppeld aan Chrome, Edge en Brave!\n\n"
            "De helper is geïnstalleerd in:\n%LOCALAPPDATA%\\AnyVideoDownloader\n\n"
            "De helper start voortaan automatisch en stil op de achtergrond zodra je YouTube opent in je browser.\n\n"
            "Je kunt dit venster nu gerust sluiten; de extensie blijft altijd werken."
        )

    def _set_window_icon(self):
        """Sets native window icon from icons/icon.ico or icons/icon.png."""
        try:
            # Search possible paths for icon.ico and icon.png
            candidates_ico = [
                get_resource_path("icon.ico"),
                get_resource_path("icons/icon.ico"),
                Path(__file__).parent.parent / "icons" / "icon.ico",
                Path(sys.executable).parent / "icons" / "icon.ico",
                Path(sys.executable).parent.parent / "icons" / "icon.ico"
            ]
            for p in candidates_ico:
                if p.exists():
                    self.root.iconbitmap(default=str(p))
                    self.root.iconbitmap(str(p))
                    break

            candidates_png = [
                get_resource_path("icons/icon48.png"),
                get_resource_path("icon48.png"),
                get_resource_path("icons/icon128.png"),
                get_resource_path("icon128.png"),
                get_resource_path("icons/icon.png"),
                get_resource_path("icon.png"),
                Path(__file__).parent.parent / "icons" / "icon48.png",
                Path(__file__).parent.parent / "icons" / "icon.png"
            ]
            for p in candidates_png:
                if p.exists():
                    self.taskbar_icon = tk.PhotoImage(file=str(p))
                    self.root.iconphoto(True, self.taskbar_icon)
                    break
        except Exception:
            pass

    def _create_header(self):
        """Creates top branding banner with the circular app icon."""
        header_frame = tk.Frame(self.root, bg="#0b0f17", pady=14)
        header_frame.pack(fill="x", padx=20)

        # Load and render the circular icon thumbnail using native PhotoImage
        self.header_icon_img = None
        try:
            candidates_png = [
                get_resource_path("icons/icon48.png"),
                get_resource_path("icon48.png"),
                get_resource_path("icons/icon.png"),
                get_resource_path("icon.png"),
                Path(__file__).parent.parent / "icons" / "icon48.png",
                Path(__file__).parent.parent / "icons" / "icon.png"
            ]
            for p in candidates_png:
                if p.exists():
                    self.header_icon_img = tk.PhotoImage(file=str(p))
                    break
        except Exception:
            pass

        if self.header_icon_img:
            logo_lbl = tk.Label(header_frame, image=self.header_icon_img, bg="#0b0f17")
            logo_lbl.pack(side="left", padx=(0, 12))

        text_group = tk.Frame(header_frame, bg="#0b0f17")
        text_group.pack(side="left", fill="y")

        title_lbl = tk.Label(
            text_group,
            text="Any Video Downloader",
            font=("Segoe UI", 14, "bold"),
            fg="#f8fafc",
            bg="#0b0f17"
        )
        title_lbl.pack(anchor="w")

        sub_lbl = tk.Label(
            text_group,
            text="Lokale Helper Daemon • Kenjigames",
            font=("Segoe UI", 8),
            fg="#94a3b8",
            bg="#0b0f17"
        )
        sub_lbl.pack(anchor="w")

    def _create_status_card(self):
        """
        Creates card with ON/OFF switch, browser-linked status badge, and dependency indicators.
        Affects main UI status card widgets and controls.
        """
        card = tk.Frame(self.root, bg="#131b2a", padx=16, pady=14, highlightbackground="#1e293b", highlightthickness=1)
        card.pack(fill="x", padx=20, pady=(0, 12))

        # Status text indicator
        self.status_badge = tk.Label(
            card,
            text="● GEKOPPELD AAN BROWSER • ACTIEF (Poort 48921)",
            font=("Segoe UI", 10, "bold"),
            fg="#10b981",
            bg="#131b2a"
        )
        self.status_badge.pack(anchor="w", pady=(0, 2))

        auto_note = tk.Label(
            card,
            text="✓ Start voortaan stil op de achtergrond. Dit venster mag gesloten worden.",
            font=("Segoe UI", 8),
            fg="#94a3b8",
            bg="#131b2a"
        )
        auto_note.pack(anchor="w", pady=(0, 4))

        # Dependencies sub-status
        has_ytdlp = bool(ToolResolver.get_binary_path('yt-dlp'))
        has_ffmpeg = bool(ToolResolver.get_binary_path('ffmpeg'))
        dep_text = f"yt-dlp: {'✓ Gereed' if has_ytdlp else '⏳ Bezig met downloaden...'}  •  FFmpeg: {'✓ Gereed' if has_ffmpeg else '○ Optioneel'}"

        self.dep_lbl = tk.Label(
            card,
            text=dep_text,
            font=("Segoe UI", 8),
            fg="#10b981" if has_ytdlp else "#f59e0b",
            bg="#131b2a"
        )
        self.dep_lbl.pack(anchor="w", pady=(0, 10))

        # Large ON / OFF Toggle Button
        self.toggle_btn = tk.Button(
            card,
            text="SERVER UITSCHAKELEN",
            font=("Segoe UI", 10, "bold"),
            bg="#10b981",
            fg="#ffffff",
            activebackground="#059669",
            activeforeground="#ffffff",
            relief="flat",
            cursor="hand2",
            padx=16,
            pady=8,
            command=self._toggle_server
        )
        self.toggle_btn.pack(fill="x")

    def _update_dep_status(self):
        """
        Updates the UI dependency label with current yt-dlp and ffmpeg availability status.
        Affects the dep_lbl text and foreground color on the main control panel.
        """
        has_ytdlp = bool(ToolResolver.get_binary_path('yt-dlp'))
        has_ffmpeg = bool(ToolResolver.get_binary_path('ffmpeg'))
        dep_text = f"yt-dlp: {'✓ Gereed' if has_ytdlp else '⏳ Bezig met downloaden...'}  •  FFmpeg: {'✓ Gereed' if has_ffmpeg else '○ Optioneel'}"
        self.dep_lbl.config(text=dep_text, fg="#10b981" if has_ytdlp else "#f59e0b")

    def _ensure_dependencies_async(self):
        """
        Asynchronously verifies and downloads required helper dependencies without blocking the GUI.
        Affects background dependency resolution and triggers a GUI label update upon completion.
        """
        def worker():
            ToolResolver.ensure_ytdlp()
            try:
                self.root.after(0, self._update_dep_status)
            except Exception:
                pass

        threading.Thread(target=worker, daemon=True).start()

    def _create_log_console(self):
        """Creates dark-mode live activity log area."""
        log_frame = tk.Frame(self.root, bg="#0b0f17")
        log_frame.pack(fill="both", expand=True, padx=20, pady=(0, 10))

        log_title = tk.Label(
            log_frame,
            text="ACTIVITEITENLOGBOEK",
            font=("Segoe UI", 8, "bold"),
            fg="#64748b",
            bg="#0b0f17"
        )
        log_title.pack(anchor="w", pady=(0, 4))

        # Text Console with Scrollbar
        console_container = tk.Frame(log_frame, bg="#080b11", highlightbackground="#1e293b", highlightthickness=1)
        console_container.pack(fill="both", expand=True)

        self.log_text = tk.Text(
            console_container,
            bg="#080b11",
            fg="#94a3b8",
            insertbackground="#ffffff",
            font=("Consolas", 8),
            relief="flat",
            wrap="word",
            state="disabled",
            padx=8,
            pady=8
        )
        self.log_text.pack(side="left", fill="both", expand=True)

        scrollbar = tk.Scrollbar(console_container, command=self.log_text.yview, bg="#1e293b", relief="flat")
        scrollbar.pack(side="right", fill="y")
        self.log_text.config(yscrollcommand=scrollbar.set)

    def _create_footer_actions(self):
        """Creates footer utility buttons."""
        footer_frame = tk.Frame(self.root, bg="#0b0f17")
        footer_frame.pack(fill="x", padx=20, pady=(0, 14))

        # Open Downloads button
        open_dl_btn = tk.Button(
            footer_frame,
            text="📁 Downloads Map Openen",
            font=("Segoe UI", 9),
            bg="#1e293b",
            fg="#e2e8f0",
            activebackground="#334155",
            activeforeground="#ffffff",
            relief="flat",
            cursor="hand2",
            padx=12,
            pady=6,
            command=self._open_downloads_folder
        )
        open_dl_btn.pack(side="left")

        # Browser link / install button
        self.install_btn = tk.Button(
            footer_frame,
            text="🔗 Koppel aan Browser",
            font=("Segoe UI", 9),
            bg="#0284c7",
            fg="#ffffff",
            activebackground="#0369a1",
            activeforeground="#ffffff",
            relief="flat",
            cursor="hand2",
            padx=10,
            pady=6,
            command=self._on_install_click
        )
        self.install_btn.pack(side="left", padx=(8, 0))

        # Clear logs button
        clear_btn = tk.Button(
            footer_frame,
            text="Wis Log",
            font=("Segoe UI", 9),
            bg="#1e293b",
            fg="#94a3b8",
            activebackground="#334155",
            activeforeground="#ffffff",
            relief="flat",
            cursor="hand2",
            padx=10,
            pady=6,
            command=self._clear_logs
        )
        clear_btn.pack(side="right")

    def _on_install_click(self):
        """Installs the helper to %LOCALAPPDATA% and registers Native Messaging."""
        try:
            install_host()
            messagebox.showinfo(
                "Succesvol Gekoppeld",
                "Any Video Downloader Helper is succesvol geïnstalleerd in %LOCALAPPDATA%\\AnyVideoDownloader en gekoppeld aan Chrome, Edge en Brave!\n\nDe helper start nu automatisch stil op de achtergrond zodra je de browser gebruikt."
            )
        except Exception as e:
            messagebox.showerror("Fout bij koppelen", f"Kon koppeling niet voltooien: {e}")

    def _toggle_server(self):
        """Toggles HTTP daemon server state."""
        if DaemonServerManager.is_running():
            self._stop_server()
        else:
            self._start_server()

    def _start_server(self):
        """Starts the server in background thread and updates UI."""
        success = DaemonServerManager.start()
        if success:
            self.status_badge.config(text="● SERVER ACTIEF (Poort 48921)", fg="#10b981")
            self.toggle_btn.config(text="SERVER UITSCHAKELEN", bg="#10b981", activebackground="#059669")
        else:
            self.status_badge.config(text="✗ STARTEN MISLUKT", fg="#ef4444")

    def _stop_server(self):
        """Stops the server and updates UI."""
        DaemonServerManager.stop()
        self.status_badge.config(text="○ SERVER GESTOPT", fg="#64748b")
        self.toggle_btn.config(text="SERVER INSCHAKELEN", bg="#334155", activebackground="#475569")

    def _on_log_message(self, message):
        """Appends incoming server log line to Text widget thread-safely."""
        def append():
            try:
                self.log_text.config(state="normal")
                self.log_text.insert("end", message + "\n")
                self.log_text.see("end")
                self.log_text.config(state="disabled")
            except Exception:
                pass

        self.root.after(0, append)

    def _clear_logs(self):
        """Clears the console log window."""
        self.log_text.config(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.config(state="disabled")

    def _open_downloads_folder(self):
        """Opens user Downloads folder in Windows Explorer."""
        dl_dir = str(Path.home() / "Downloads")
        if os.name == 'nt':
            os.startfile(dl_dir)
        else:
            subprocess.Popen(['xdg-open', dl_dir])

    def _on_close(self):
        """Shuts down server on window close."""
        unregister_log_callback(self._on_log_message)
        DaemonServerManager.stop()
        self.root.destroy()


def get_appdata_dir():
    """Returns %LOCALAPPDATA%\\AnyVideoDownloader directory path."""
    local_appdata = os.environ.get('LOCALAPPDATA') or str(Path.home() / 'AppData' / 'Local')
    return Path(local_appdata) / "AnyVideoDownloader"


def install_host():
    """
    Installs AnyVideoDownloaderHelper and yt-dlp to %LOCALAPPDATA%\\AnyVideoDownloader\\,
    writes Native Messaging manifest JSON, and registers NativeMessagingHosts in HKCU.
    Affects Windows registry entries and files in %LOCALAPPDATA%\\AnyVideoDownloader.
    """
    import winreg
    target_dir = get_appdata_dir()
    target_dir.mkdir(parents=True, exist_ok=True)

    if getattr(sys, 'frozen', False):
        current_exe = Path(sys.executable).resolve()
    else:
        current_exe = Path(__file__).resolve()

    target_exe = target_dir / "AnyVideoDownloaderHelper.exe"

    # Copy current executable if running from PyInstaller bundle and different path
    if current_exe.exists() and current_exe.suffix.lower() == '.exe' and current_exe != target_exe:
        try:
            shutil.copy2(str(current_exe), str(target_exe))
        except Exception:
            pass

    # Copy yt-dlp.exe to target directory
    target_ytdlp = target_dir / "yt-dlp.exe"
    ytdlp_src = None
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        bundle_ytdlp = Path(sys._MEIPASS) / "yt-dlp.exe"
        if bundle_ytdlp.exists():
            ytdlp_src = bundle_ytdlp

    if not ytdlp_src:
        local_ytdlp = current_exe.parent / "yt-dlp.exe"
        if local_ytdlp.exists():
            ytdlp_src = local_ytdlp

    if not ytdlp_src:
        resolved = ToolResolver.get_binary_path('yt-dlp')
        if resolved and Path(resolved).exists():
            ytdlp_src = Path(resolved)

    if ytdlp_src and ytdlp_src.exists() and str(ytdlp_src.resolve()) != str(target_ytdlp.resolve()):
        try:
            if not target_ytdlp.exists() or target_ytdlp.stat().st_size != ytdlp_src.stat().st_size:
                shutil.copy2(str(ytdlp_src), str(target_ytdlp))
        except Exception:
            pass

    # Copy ffmpeg.exe to target directory if found on system and not yet present
    target_ffmpeg = target_dir / "ffmpeg.exe"
    if not target_ffmpeg.exists():
        ffmpeg_src = ToolResolver.get_binary_path('ffmpeg')
        if ffmpeg_src and Path(ffmpeg_src).exists() and str(Path(ffmpeg_src).resolve()) != str(target_ffmpeg.resolve()):
            try:
                shutil.copy2(str(ffmpeg_src), str(target_ffmpeg))
            except Exception:
                pass

    manifest_exe = target_exe if target_exe.exists() else current_exe

    # Write Native Messaging Host manifest JSON
    manifest_data = {
        "name": NATIVE_HOST_NAME,
        "description": "Any Video Downloader Helper Native Host",
        "path": str(manifest_exe),
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{EXTENSION_ID}/"
        ]
    }
    manifest_file = target_dir / f"{NATIVE_HOST_NAME}.json"
    with open(manifest_file, 'w', encoding='utf-8') as f:
        json.dump(manifest_data, f, indent=2)

    # Register in Windows HKCU registry for Chromium browsers
    registry_targets = [
        rf"Software\Google\Chrome\NativeMessagingHosts\{NATIVE_HOST_NAME}",
        rf"Software\Microsoft\Edge\NativeMessagingHosts\{NATIVE_HOST_NAME}",
        rf"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{NATIVE_HOST_NAME}",
        rf"Software\Chromium\NativeMessagingHosts\{NATIVE_HOST_NAME}"
    ]
    for reg_path in registry_targets:
        try:
            key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, reg_path)
            winreg.SetValue(key, "", winreg.REG_SZ, str(manifest_file))
            winreg.CloseKey(key)
        except Exception:
            pass

    return True


def uninstall_host():
    """
    Removes NativeMessagingHosts registry keys and cleans up %LOCALAPPDATA%\\AnyVideoDownloader.
    """
    import winreg
    registry_targets = [
        rf"Software\Google\Chrome\NativeMessagingHosts\{NATIVE_HOST_NAME}",
        rf"Software\Microsoft\Edge\NativeMessagingHosts\{NATIVE_HOST_NAME}",
        rf"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{NATIVE_HOST_NAME}",
        rf"Software\Chromium\NativeMessagingHosts\{NATIVE_HOST_NAME}"
    ]
    for reg_path in registry_targets:
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, reg_path)
        except Exception:
            pass

    target_dir = get_appdata_dir()
    if target_dir.exists():
        try:
            shutil.rmtree(str(target_dir))
        except Exception:
            pass
    return True


def run_native_host():
    """
    Runs the helper in 100% headless Native Messaging Host mode.
    No Tkinter GUI is created. No console window is shown.
    Redirects sys.stdout to sys.stderr to protect the Native Messaging binary protocol.
    Starts the HTTP daemon server on port 48921.
    Listens on sys.stdin.buffer for Native Messaging messages.
    Exits cleanly as soon as the browser closes (EOF on stdin).
    """
    # Grab binary streams before redirecting standard stdout
    native_in = sys.stdin.buffer
    native_out = sys.stdout.buffer

    # Route all normal print/logging to stderr so stdout remains 100% pure binary protocol
    sys.stdout = sys.stderr

    # Start the HTTP server daemon on port 48921
    DaemonServerManager.start()

    try:
        while True:
            # Native Messaging: 4 bytes unsigned int (little-endian)
            raw_len = native_in.read(4)
            if not raw_len or len(raw_len) < 4:
                # Browser closed pipe or exited -> clean shutdown
                break

            msg_len = struct.unpack('<I', raw_len)[0]
            if msg_len == 0:
                continue

            raw_msg = native_in.read(msg_len)
            if not raw_msg or len(raw_msg) < msg_len:
                break

            try:
                msg = json.loads(raw_msg.decode('utf-8'))
            except Exception:
                msg = {}

            # Construct response packet
            response = {
                "status": "online",
                "port": PORT,
                "ytdlp": ToolResolver.get_binary_path('yt-dlp') is not None,
                "ffmpeg": ToolResolver.get_binary_path('ffmpeg') is not None,
                "echo": msg.get("action", "pong")
            }

            resp_bytes = json.dumps(response).encode('utf-8')
            native_out.write(struct.pack('<I', len(resp_bytes)))
            native_out.write(resp_bytes)
            native_out.flush()
    except Exception:
        pass
    finally:
        # Shutdown daemon cleanly and terminate process
        DaemonServerManager.stop()
        sys.exit(0)


def launch_gui():
    """Launches the Tkinter modern helper GUI."""
    root = tk.Tk()
    app = ModernHelperGUI(root)
    root.mainloop()


if __name__ == '__main__':
    args = sys.argv[1:]
    is_native = any(
        arg.startswith('chrome-extension://') or arg in ('--native-host', '--native', '-n')
        for arg in args
    )

    if '--install' in args:
        install_host()
        sys.exit(0)
    elif '--uninstall' in args:
        uninstall_host()
        sys.exit(0)
    elif '--silent' in args or '--headless' in args or is_native:
        run_native_host()
    else:
        launch_gui()
