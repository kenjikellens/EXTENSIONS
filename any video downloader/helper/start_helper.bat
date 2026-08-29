@echo off
title Any Video Downloader Helper
cd /d "%~dp0"

echo ===================================================
echo   Any Video Downloader - Portable Helper Server
echo ===================================================
echo.

:: 1. If server.py does not exist, download or restore it
if not exist "server.py" (
    echo [INFO] server.py niet gevonden. Bezig met ophalen van server.py...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://raw.githubusercontent.com/kenjikellens/EXTENSIONS/main/any%%20video%%20downloader/helper/server.py', 'server.py')"
)

:: 2. Check yt-dlp binary
if not exist "yt-dlp.exe" (
    where yt-dlp >nul 2>&1
    if errorlevel 1 (
        echo [INFO] yt-dlp.exe niet gevonden. Bezig met automatisch downloaden van nieuwste yt-dlp...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', 'yt-dlp.exe')"
        if exist "yt-dlp.exe" (
            echo [OK] yt-dlp.exe succesvol gedownload!
        )
    )
)

:: 3. Run server via Python launcher or Python
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
echo Installeer Python vanaf https://www.python.org/downloads/
pause

:end
