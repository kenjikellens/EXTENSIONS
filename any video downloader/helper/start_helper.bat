@echo off
title Any Video Downloader Helper
cd /d "%~dp0"

echo ===================================================
echo   Any Video Downloader - Portable Helper Server
echo ===================================================
echo.

:: 1. Check yt-dlp binary
if not exist "yt-dlp.exe" (
    where yt-dlp >nul 2>&1
    if errorlevel 1 (
        echo [INFO] yt-dlp.exe niet gevonden. Bezig met automatisch downloaden van de nieuwste versie...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', 'yt-dlp.exe')"
        if exist "yt-dlp.exe" (
            echo [OK] yt-dlp.exe succesvol gedownload!
        ) else (
            echo [WAARSCHUWING] Automatisch downloaden mislukt. Zorg voor een internetverbinding.
        )
    )
)

:: 2. Check Python executable
where py >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Starten via Python Launcher...
    py -u server.py
    goto end
)

where python >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Starten via Python...
    python -u server.py
    goto end
)

echo [FOUT] Python is niet gevonden op deze pc.
echo Installeer Python vanaf https://www.python.org/downloads/ (vink 'Add Python to PATH' aan).
pause

:end
