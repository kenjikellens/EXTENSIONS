# -*- mode: python ; coding: utf-8 -*-
import os
from pathlib import Path

base_dir = Path(SPECPATH).resolve()
icons_dir = base_dir.parent / "icons"

a = Analysis(
    [str(base_dir / 'app_gui.py')],
    pathex=[str(base_dir)],
    binaries=[
        (str(base_dir / 'yt-dlp.exe'), '.'),
    ],
    datas=[
        (str(icons_dir / 'icon.ico'), '.'),
        (str(icons_dir / 'icon.png'), '.'),
        (str(icons_dir / 'icon48.png'), '.'),
    ],
    hiddenimports=['tkinter', 'server', 'urllib.request', 'winreg', 'struct', 'json', 'shutil'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='AnyVideoDownloaderHelper',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    icon=str(icons_dir / 'icon.ico'),
    version=str(base_dir / 'version_info.txt'),
)
