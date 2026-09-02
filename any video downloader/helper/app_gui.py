"""
app_gui.py - Sleek Minimalist GUI for Any Video Downloader Helper.
Provides a modern dark-mode control panel with an ON/OFF toggle switch, live status, and log ticker.
No black command line window.
"""

import os
import subprocess
import sys
import threading
import time
from pathlib import Path
import tkinter as tk
from tkinter import messagebox

# Import the core daemon manager from server.py
from server import DaemonServerManager, ToolResolver, register_log_callback, unregister_log_callback, PORT, HOST


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
        """Creates card with ON/OFF switch and status badge."""
        card = tk.Frame(self.root, bg="#131b2a", padx=16, pady=14, highlightbackground="#1e293b", highlightthickness=1)
        card.pack(fill="x", padx=20, pady=(0, 12))

        # Status text indicator
        self.status_badge = tk.Label(
            card,
            text="● SERVER ACTIEF (Poort 48921)",
            font=("Segoe UI", 11, "bold"),
            fg="#10b981",
            bg="#131b2a"
        )
        self.status_badge.pack(anchor="w", pady=(0, 4))

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


def launch_gui():
    """Launches the Tkinter modern helper GUI."""
    root = tk.Tk()
    app = ModernHelperGUI(root)
    root.mainloop()


if __name__ == '__main__':
    launch_gui()
