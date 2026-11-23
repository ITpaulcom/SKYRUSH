@echo off
chcp 65001 >nul
title Sky Duell - Online stellen
cd /d "%~dp0"

echo.
echo  ==============================
echo   SKY DUELL - online stellen
echo  ==============================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js fehlt - wird jetzt installiert ...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  echo.
  echo Fertig. Bitte dieses Fenster schliessen und die Datei noch einmal doppelklicken.
  pause
  exit /b
)

if not exist node_modules (
  echo Pakete installieren ^(nur beim ersten Mal, dauert 1-2 Minuten^) ...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto fehler
)

if not exist .skyrush.json (
  echo.
  echo Einmalige Einrichtung: ein paar Fragen beantworten, Enter uebernimmt den Vorschlag.
  call npm run setup
  if errorlevel 1 goto fehler
)

call npm run deploy
if errorlevel 1 goto fehler

echo.
echo Fertig! Die Adressen stehen oben. Zum Aendern der Angaben: npm run setup
pause
exit /b

:fehler
echo.
echo Da ist etwas schiefgegangen - die Meldung oben zeigt den Grund.
pause
