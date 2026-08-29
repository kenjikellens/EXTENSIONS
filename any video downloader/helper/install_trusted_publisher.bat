@echo off
title Kenjigames Uitgever Installeren en Icooncache Verversen
cd /d "%~dp0"

echo =======================================================
echo   Kenjigames - Uitgever Certificaat & Icoon Verversen
echo =======================================================
echo.

echo [1/2] Bezig met installeren van Kenjigames certificaat...
certutil -user -addstore TrustedPublisher "Kenjigames.cer" >nul 2>&1
if not errorlevel 1 (
    echo [OK] Kenjigames succesvol toegevoegd als Vertrouwde Uitgever!
) else (
    echo [INFO] Certificaat reeds geïnstalleerd.
)

echo.
echo [2/2] Bezig met verversen van Windows Verkenner icooncache...
ie4uinit.exe -show >nul 2>&1

echo.
echo =======================================================
echo Klaar! AnyVideoDownloaderHelper.exe is nu 100%% vertrouwd.
echo =======================================================
pause
