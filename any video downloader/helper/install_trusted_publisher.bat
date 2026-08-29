@echo off
:: Self-elevate to Administrator to install root certificate
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Vraag administrator-rechten aan...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title Kenjigames Uitgever Installeren
cd /d "%~dp0"

echo =======================================================
echo   Kenjigames - Officiële Uitgever Installeren
echo =======================================================
echo.

echo [1/2] Bezig met installeren in Trusted Root & Trusted Publisher...
certutil -addstore Root "Kenjigames.cer" >nul 2>&1
certutil -addstore TrustedPublisher "Kenjigames.cer" >nul 2>&1

if %errorLevel% equ 0 (
    echo [OK] Kenjigames succesvol geregistreerd als Officiële Uitgever!
) else (
    echo [FOUT] Installatie mislukt.
)

echo.
echo [2/2] Icooncache verversen...
ie4uinit.exe -show >nul 2>&1

echo.
echo =======================================================
echo KLAAR! Windows SmartScreen toont nu 'Uitgever: Kenjigames'.
echo =======================================================
pause
