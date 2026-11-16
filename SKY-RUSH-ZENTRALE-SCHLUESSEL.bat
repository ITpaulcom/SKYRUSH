@echo off
chcp 65001 >nul
title Sky Rush - Neuer Zentrale-Schluessel
cd /d "%~dp0"
echo.
echo  Erzeugt einen neuen Schluessel fuer die Zentrale (/admin.html) und stellt ihn online.
echo  Danach gilt nur noch der neue Schluessel - auch Sperren nach Fehlversuchen sind damit aufgehoben.
echo.
choice /c JN /m "Neuen Schluessel erzeugen"
if errorlevel 2 exit /b 0
node scripts\admin-key.mjs
if errorlevel 1 goto fehler
echo Jetzt online stellen ...
call "%~dp0SKY-RUSH-DEPLOY.bat"
exit /b
:fehler
echo Da ist etwas schiefgegangen.
pause
