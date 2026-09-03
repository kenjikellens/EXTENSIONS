@echo off
title Any Video Downloader Helper - De-installatie
cd /d "%~dp0"

echo =========================================================
echo    Any Video Downloader - Helper Verwijderen
echo =========================================================
echo.

set "TARGET_DIR=%LOCALAPPDATA%\AnyVideoDownloader"
set "HOST_NAME=com.kenjigames.any_video_downloader"

echo [*] Registersleutels verwijderen...
reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\%HOST_NAME%" /f >nul 2>&1
reg delete "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\%HOST_NAME%" /f >nul 2>&1

echo [*] Bestanden opruimen in %TARGET_DIR%...
if exist "%TARGET_DIR%" (
    rmdir /s /q "%TARGET_DIR%" >nul 2>&1
)

echo.
echo =========================================================
echo  [OK] Any Video Downloader Helper is netjes verwijderd.
echo =========================================================
echo.
pause
