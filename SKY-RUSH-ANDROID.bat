@echo off
chcp 65001 >nul
title Sky Duell - Android-App bauen
cd /d "%~dp0"
echo.
echo  SKY DUELL - Android-App fuer den Play Store
echo  Beim ersten Mal werden Java und das Android-SDK in den Ordner .tools geladen (ca. 1 GB).
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js fehlt - bitte zuerst SKY-RUSH-DEPLOY.bat ausfuehren.
  pause
  exit /b 1
)
if not exist node_modules call npm install --no-audit --no-fund
node scripts\android-build.mjs
echo.
pause
