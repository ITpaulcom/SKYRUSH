# Sky Duell – in die Stores

Preise und Regeln der Stores ändern sich. Im Zweifel gilt, was in der jeweiligen Konsole steht.

## 1. Konten (einmalig)
| Konto | Wofür | Kosten (bitte prüfen) |
|---|---|---|
| Netlify | Spiel + Server + Datenschutzseite | kostenloser Plan reicht zum Start |
| AdMob | Werbung | kostenlos |
| Google Play Console | Android | einmalig 25 $ |
| Apple Developer Program | iOS | 99 $ / Jahr |
| RevenueCat (optional) | „Werbefrei“ & Münzpaket | kostenlos bis zu einem Umsatzlimit |
| Codemagic (nur ohne Mac) | iOS-Build in der Cloud | kostenloses Kontingent |

Neue private Google-Play-Konten müssen vor der Veröffentlichung einen geschlossenen Test mit einer Mindestzahl an Testern über mehrere Tage durchführen. Die aktuellen Vorgaben stehen in der Play Console.

## 2. Online stellen
```
npm install
npm run setup
npm run deploy
```
Danach läuft das Spiel im Web, Ranglisten und Werbe-Auswertung funktionieren.

## 3. AdMob einrichten
1. In AdMob zwei Apps anlegen (Android, iOS) mit je einem **Rewarded**- und einem **Interstitial**-Block.
2. Unter *Datenschutz & Mitteilungen* die DSGVO-Einwilligung (und für iOS die IDFA-Erklärung) erstellen und veröffentlichen.
3. `npm run setup` erneut ausführen, die IDs eintragen. „Echte Werbung aktivieren?“ erst mit **j** beantworten, wenn du die Store-Version baust.
4. `npm run deploy`. Damit liegt `app-ads.txt` auf deiner Seite. Gib in den Stores als Entwickler-Website **genau diese Domain** an, sonst findet AdMob die Datei nicht. Am saubersten ist eine eigene Domain (z. B. `skyrush.itpaul.com`), die du in Netlify verbindest.
5. Optional für mehr Umsatz: Mediation mit Bidding (AppLovin, Unity, Meta, Liftoff) in AdMob aktivieren und die SKAdNetwork-IDs dieser Partner in `ios/App/App/Info.plist` ergänzen.

Wichtig: Tippe nie selbst auf echte eigene Anzeigen. Das kann zur Sperrung des AdMob-Kontos führen.

## 4. Käufe (optional)
Produkte anlegen (siehe `store/STORE.md`), in RevenueCat das Entitlement `no_ads` und das Offering „default“ einrichten, dann die Schlüssel per `npm run setup` eintragen.

## 5. Android bauen (Windows reicht)
1. Einmalig einen Upload-Schlüssel erzeugen und **sicher aufbewahren**:
   `keytool -genkey -v -keystore skyrush-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
2. `android/keystore.properties.example` nach `android/keystore.properties` kopieren und ausfüllen.
3. `npm run android`. In Android Studio *Build → Generate Signed App Bundle* wählen, dann die `.aab` in der Play Console hochladen.

## 6. iOS bauen
- **Mit Mac:** `npm run ios`, dann in Xcode *Product → Archive*.
- **Ohne Mac:** Projekt zu GitHub pushen und in Codemagic verbinden. Dort den App-Store-Connect-API-Schlüssel als Integration `app_store_connect` hinterlegen und den Workflow `ios-release` starten. Der Build landet automatisch in TestFlight.

## 7. Store-Einträge
Texte, Screenshots, Datensicherheit und Altersfreigabe stehen fertig in `store/STORE.md`.

## Checkliste vor der Veröffentlichung
- [ ] `npm run setup` mit echten AdMob-IDs und „Echte Werbung“ = j, danach `npm run deploy`
- [ ] Einwilligungsabfrage erscheint beim ersten Start (in der EU testen), iOS fragt nach Tracking
- [ ] „Werbefrei“ und „Käufe wiederherstellen“ im Sandbox-Modus getestet
- [ ] Rangliste zeigt Einträge, `/admin.html` zeigt Zahlen
- [ ] `…/privacy.html` und `…/impressum.html` stimmen
- [ ] Versionsnummer erhöht (`versionName` in `android/app/build.gradle`, Version in Xcode, `version` in `www/config.js`)

## Werbe-Taktung
Eingestellt in `www/config.js → ads.interstitial`:
- Die ersten 3 Läufe sind werbefrei.
- Danach kommt höchstens nach jedem 3. Lauf eine Werbepause, mit mindestens 150 s Abstand und maximal 12 pro Tag.

Den Großteil verdienen die freiwilligen Videos (Zweite Chance, Münzen verdoppeln, Turnier-Extra-Versuch). Justiere anhand von `/admin.html` und der Bindungszahlen in den Store-Konsolen nach.
