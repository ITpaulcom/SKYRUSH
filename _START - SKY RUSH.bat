@echo off
chcp 65001 >nul
title Sky Duell - Steuerzentrale
cd /d "%~dp0"
:menu
cls
echo.
echo   =============================================
echo     SKY DUELL - STEUERZENTRALE
echo   =============================================
echo     Projektordner: %~dp0
echo.
echo     SPIEL
echo       1  Spiel online stellen (Web + Server)
echo       2  Android-App bauen  (Ergebnis landet in builds\)
echo       3  Update einspielen  (neueste SkyRush-Update-*.zip aus Downloads/Desktop)
echo       G  Galaxy-Store-App bauen   (APK nur mit Werbung, fuer Samsung)
echo       P  Web-Portal-Pakete bauen  (CrazyGames + Poki, ZIP in builds\)
echo.
echo     OEFFNEN
echo       4  Spiel im Browser
echo       5  Sky Duell Zentrale (Admin)
echo       6  Google Play Console
echo       7  AdMob
echo       8  Ordner builds  (fertige .aab-Dateien)
echo       9  Ordner store   (Store-Texte, Bilder, Screenshots)
echo       M  Ordner MATERIAL (alles fuer Stores: Texte, Screenshots, Icons, IDs)
echo.
echo     SONSTIGES
echo       Z  Zahlungen einrichten (RevenueCat-Schluessel eintragen)
echo       S  Neuen Zentrale-Schluessel erzeugen
echo       0  Beenden
echo.
choice /c 123456789GPSMZ0 /n /m "  Auswahl: "
set "K=%errorlevel%"
if "%K%"=="1" (call "%~dp0SKY-RUSH-DEPLOY.bat" & goto menu)
if "%K%"=="2" (call "%~dp0SKY-RUSH-ANDROID.bat" & start "" explorer "%~dp0builds" & goto menu)
if "%K%"=="3" goto update
if "%K%"=="4" (start "" "https://myskyrush.com/" & goto menu)
if "%K%"=="5" (start "" "https://myskyrush.com/admin.html" & goto menu)
if "%K%"=="6" (start "" "https://play.google.com/console/u/1/developers/7829093855860564632/app/4976021817400735669/app-dashboard" & goto menu)
if "%K%"=="7" (start "" "https://admob.google.com/v2/home" & goto menu)
if "%K%"=="8" (start "" explorer "%~dp0builds" & goto menu)
if "%K%"=="9" (start "" explorer "%~dp0store" & goto menu)
if "%K%"=="10" (node scripts\android-build.mjs galaxy & pause & start "" explorer "%~dp0builds" & goto menu)
if "%K%"=="11" (node scripts\portal-build.mjs alle & pause & start "" explorer "%~dp0builds" & goto menu)
if "%K%"=="12" (call "%~dp0SKY-RUSH-ZENTRALE-SCHLUESSEL.bat" & goto menu)
if "%K%"=="13" (start "" explorer "%~dp0MATERIAL" & goto menu)
if "%K%"=="14" (node scripts\setup-payments.mjs & pause & goto menu)
exit /b 0

:update
set "ZIP="
rem Hoechste Versionsnummer aus Downloads + Desktop gewinnt (nicht die zuletzt geladene Datei)
for /f "usebackq delims=" %%F in (`powershell -NoProfile -Command "$f = Get-ChildItem -Path $env:USERPROFILE\Downloads,$env:USERPROFILE\Desktop -Filter 'SkyRush-Update-*.zip' -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -match '^SkyRush-Update-(\d+(\.\d+)+)' } | Sort-Object @{e={[version]([regex]::Match($_.BaseName,'\d+(\.\d+)+').Value)}}, LastWriteTime -Descending | Select-Object -First 1; if ($f) { $f.FullName }"`) do set "ZIP=%%F"
if not defined ZIP (
  echo.
  echo   Keine SkyRush-Update-*.zip in Downloads oder auf dem Desktop gefunden.
  echo   Lade das Update herunter und waehle dann noch einmal 3.
  pause
  goto menu
)
for %%N in ("%ZIP%") do set "NAME=%%~nN"
set "NEWER="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$n=[version]([regex]::Match('%NAME%','\d+(\.\d+)+').Value); $m=Get-ChildItem -Path '%~dp0updates' -Filter 'SkyRush-Update-*.zip' -File -ErrorAction SilentlyContinue | ForEach-Object { [version]([regex]::Match($_.BaseName,'\d+(\.\d+)+').Value) } | Sort-Object -Descending | Select-Object -First 1; if ($m -and $n -lt $m) { $m.ToString() }"`) do set "NEWER=%%V"
if not defined NEWER goto upok
echo.
echo   ACHTUNG: %NAME% ist AELTER als das schon eingespielte Update %NEWER%.
echo   Es wird NICHT eingespielt ^(sonst waere das Spiel wieder auf altem Stand^).
echo   Die alte Datei wird nach updates\alt verschoben.
if not exist "%~dp0updates\alt" mkdir "%~dp0updates\alt"
move /y "%ZIP%" "%~dp0updates\alt\" >nul
pause
goto menu
:upok
set "DEST=%~dp0updates\%NAME%"
echo.
echo   Gefunden: %ZIP%
echo   (Richtig? Sonst Fenster schliessen und alte SkyRush-Update-Dateien loeschen.)
echo   Entpacke nach: updates\%NAME%
if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"
tar -xf "%ZIP%" -C "%DEST%"
if errorlevel 1 (
  echo   Entpacken fehlgeschlagen.
  pause
  goto menu
)
move /y "%ZIP%" "%~dp0updates\" >nul
call "%DEST%\UPDATE-EINSPIELEN.bat"
pause
goto menu
