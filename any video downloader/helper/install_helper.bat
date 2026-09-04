@echo off
setlocal enabledelayedexpansion
title Any Video Downloader Helper - Installatie
cd /d "%~dp0"

echo =========================================================
echo    Any Video Downloader - Automatische Helper Installatie
echo =========================================================
echo.

set "TARGET_DIR=%LOCALAPPDATA%\AnyVideoDownloader"
set "EXE_SRC=%~dp0AnyVideoDownloaderHelper.exe"
set "EXE_DEST=%TARGET_DIR%\AnyVideoDownloaderHelper.exe"
set "MANIFEST_DEST=%TARGET_DIR%\com.kenjigames.any_video_downloader.json"
set "HOST_NAME=com.kenjigames.any_video_downloader"
set "EXT_ID=dobnkoiladafpdokalpkggcpkcallaei"

:: 1. Maak doelmap aan in %LOCALAPPDATA%
if not exist "%TARGET_DIR%" (
    echo [*] Applicatiemap aanmaken in %LOCALAPPDATA%\AnyVideoDownloader...
    mkdir "%TARGET_DIR%" >nul 2>&1
)

:: 2. Kopieer de executable
if exist "%EXE_SRC%" (
    echo [*] Eventueel actieve helper afsluiten voor update...
    taskkill /f /im AnyVideoDownloaderHelper.exe >nul 2>&1
    timeout /t 1 /nobreak >nul
    echo [*] AnyVideoDownloaderHelper.exe kopiëren...
    copy /y "%EXE_SRC%" "%EXE_DEST%" >nul
) else (
    echo [WAARSCHUWING] AnyVideoDownloaderHelper.exe niet gevonden in huidige map.
)

:: 3. Genereer JSON manifest voor Chrome Native Messaging
echo [*] Native Messaging manifest configureren...
set "JSON_EXE_PATH=%EXE_DEST:\=\\%"

(
    echo {
    echo   "name": "%HOST_NAME%",
    echo   "description": "Any Video Downloader Helper Native Host",
    echo   "path": "%JSON_EXE_PATH%",
    echo   "type": "stdio",
    echo   "allowed_origins": [
    echo     "chrome-extension://%EXT_ID%/"
    echo   ]
    echo }
) > "%MANIFEST_DEST%"

:: 4. Registreer in Windows Register (HKCU - Geen Administrator nodig)
echo [*] Registreren voor Google Chrome...
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_DEST%" /f >nul

echo [*] Registreren voor Microsoft Edge...
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_DEST%" /f >nul

echo [*] Registreren voor Brave Browser...
reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_DEST%" /f >nul

echo.
echo =========================================================
echo  [OK] Installatie Succesvol Voltooid!
echo =========================================================
echo.
echo De helper staat nu geregistreerd in:
echo   %TARGET_DIR%
echo.
echo Je hoeft de .exe nooit meer handmatig te starten!
echo Zodra je de browser gebruikt, start de helper 100%% stil
echo op de achtergrond, en sluit zichzelf af wanneer de browser sluit.
echo.
pause
