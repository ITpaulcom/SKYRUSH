# Sky Rush

Doodle Jump trifft Subway Surfers: Hops springt von allein nach oben. Du lenkst ihn über 11 Bahnen. Wie viele du siehst, hängt vom Gerät ab: am Handy etwa 3, am PC fast alle. Was außerhalb des Bildes liegt, siehst du erst, wenn du hinwechselst. Web, Android und iOS laufen aus einer Codebasis, der Server läuft komplett auf Netlify.

## Am einfachsten (Windows)
**`SKY-RUSH-DEPLOY.bat` doppelklicken.** Die Datei installiert bei Bedarf Node.js, fragt beim ersten Mal ein paar Angaben ab und stellt alles online. Später genügt ein Doppelklick zum Aktualisieren.

Werbung einrichten: **ADMOB.md**

## In 3 Befehlen online
Voraussetzung: [Node.js](https://nodejs.org) (Version 20 oder neuer). Ordner öffnen, Terminal starten:

```
npm install
npm run setup     # fragt Name/Adresse (Impressum), optional AdMob- & Kauf-IDs ab
npm run deploy    # testet, legt die Netlify-Seite an, veröffentlicht Spiel + Server
```
Beim ersten `deploy` öffnet sich einmal der Browser für die Netlify-Anmeldung. Danach siehst du:
- **Spiel:** `https://skyrush-xxxx.netlify.app`
- **Zentrale (Werbeumsatz, Ranglisten):** `…/admin.html`, mit dem Schlüssel, den `setup` angezeigt hat
- **Datenschutz-URL für die Stores:** `…/privacy.html`

Jede spätere Änderung veröffentlichst du einfach wieder mit `npm run deploy`.

## Apps
```
npm run android   # öffnet Android Studio → Build → Generate Signed App Bundle
npm run ios       # öffnet Xcode (nur Mac) – ohne Mac: Codemagic, siehe RELEASE.md
```
Die Apps nutzen automatisch die Server-Adresse, die `deploy` eingetragen hat.

## Lokal ausprobieren
```
npm start         # Spiel + Server lokal (Netlify Dev) unter http://localhost:8888
npm test          # Spielkern (Fairness, Replay, Balance) + Duell-Server mit simulierten Spielern
```

## Steuerung
Eine Berührung löst immer genau eine Aktion aus:
- **Tippen** auf die linke/rechte Bildschirmhälfte: eine Bahn.
- **Wischen** nach links/rechts: eine Bahn. Wer den Finger eine ganze Bahnbreite weiterzieht, wechselt eine weitere.
- **Nach oben wischen:** Doppelsprung.
- **Nach unten wischen:** durch die nächste Plattform hindurchfallen (eine Ebene tiefer).
- Lange drücken, schräge Wischer oder ein zweiter Finger lösen absichtlich nichts aus.
- **Drohnen** besiegst du, indem du von oben auf sie springst.
- Am PC: Pfeiltasten/WASD, Leertaste für den Doppelsprung, Pfeil runter zum Durchfallen, F für Vollbild.
- **Controller** (Xbox, PlayStation, Switch Pro/Joy-Con, 8BitDo, Logitech, Handy-Controller wie Backbone/Kishi – Kabel oder Bluetooth, Browser und Apps): Steuerkreuz oder linker Stick ← → = Bahn (auch LB/RB), ↑ oder A/✕ = Doppelsprung, ↓ oder B/○ = Durchfallen, Start/Options/+ = Pause. In allen Menüs: Steuerkreuz/Stick wählt, A bestätigt (Nintendo: A rechts), B zurück, rechter Stick blättert, Start auf dem Startbildschirm = Spielen. Vibration über den Schalter „Vibration“. Code: `www/pad.js`.

## Was wo liegt
| Pfad | Inhalt |
|---|---|
| `www/` | Das Spiel (wird 1:1 veröffentlicht und in die Apps kopiert) |
| `www/remote.js` | Einstellungen aus der Zentrale (Werbung, Anbieter, Google) übernehmen |
| `www/konto.html` | Anmeldeseite „Spielstand mit Google sichern“ |
| `netlify/functions/account.mjs` | Google-Konto verbinden, Spielstand auf neuem Gerät laden |
| `www/pad.js` | Controller-Steuerung (Gamepad API, alle gängigen Controller, Menü-Navigation, Vibration) |
| `www/core.js` | Spielkern, deterministisch – derselbe Code prüft auf dem Server jeden Lauf |
| `www/config.js` | Alle IDs und Schlüssel (füllt `npm run setup`) |
| `www/admin.html` | Deine Zentrale |
| `netlify/functions/` | Server: Spieler, Score-Prüfung, Ranglisten, Duelle, Werbeumsatz, Admin |
| `www/bot.js` | Trainings-Bot für Duelle, wenn niemand online ist |
| `legal/` | Vorlagen für Impressum & Datenschutz (setup füllt sie aus) |
| `android/`, `ios/` | App-Projekte (Icons, Splash, AdMob, Hochformat sind eingerichtet) |
| `store/` | Screenshots, Icon, Vorstellungsgrafik, Store-Texte |

Gespeichert wird alles in **Netlify Blobs**, das ist bei Netlify inklusive. Eine Datenbank oder einen weiteren Dienst brauchst du nicht.

Veröffentlichen in den Stores: **RELEASE.md**

## Anti-Cheat (ab 1.5)
Der Server glaubt dem Gerät nichts – `netlify/lib/anticheat.mjs`:
- **Lauf-Ticket** (`/api/run`): Welt, Aufrüstungen und Startzeit legt der Server vor dem Lauf fest. Jedes Ticket gilt einmal.
- **Nachrechnen**: Jeder Lauf wird auf dem Server mit dem Spielkern nachgespielt; nur das Ergebnis des Servers zählt.
- **Zeitprüfung**: Spielzeit muss zur echten Zeit passen (Speedhack, Zeitlupe, Sofort-Bots).
- **Eingabe-Analyse**: übermenschlich schnelle Eingaben werden abgelehnt.
- **Versuche** für Tages-Run und Turnier zählt der Server.
- **Zentrale** (`/admin.html` → Anti-Cheat): abgelehnte/auffällige Läufe, Top-Einträge, Spieler sperren/entsperren. Replays der Top 20 liegen unter `ac/r/…`.
- **Gerät**: Spielstand mit gerätegebundener Prüfsumme (veränderter Stand → letzter echter Stand kommt zurück), kein Debug-Zugriff in der App.
Test: `npm run test:ac`. Grenzwerte stehen oben in `anticheat.mjs` (`LIMITS`).

## Tresor – Münzen & Freischaltungen auf dem Server (ab 1.5)
Der verbindliche Spielstand jedes Spielers liegt auf dem Server (`vault/<uid>`), nicht auf dem Gerät.
- Gemeinsame Regeln: `www/economy.js` + `www/catalog.js` (Preise, Freischaltungen, Belohnungen) – laufen auf Gerät **und** Server.
- Das Gerät schickt nur Aktionen an `/api/vault` (kaufen, Belohnung abholen, Lauf mit Eingaben …). Der Server rechnet nach und schickt den echten Stand zurück – am Gerät veränderte Münzen/Freischaltungen fallen beim nächsten Abgleich weg.
- Münzen aus Läufen: nur aus dem nachgerechneten Lauf (Ticket = voll; offline gestartet = nachgerechnet, max. 20 Läufe / 4.000 Münzen pro Tag).
- Truhen & Glücksrad: Zufall nur auf dem Server (geheimer Startwert je Spieler) – nicht vorhersagbar, nicht neu würfelbar.
- Werbe-Belohnungen: Tagesgrenzen auf dem Server.
- Echtgeld: mit `REVENUECAT_SECRET` (in `.env`, per „5 - Zahlungen einrichten.bat“) prüft der Server jeden Kauf bei RevenueCat; ohne Secret werden Käufe übernommen und in der Zentrale vermerkt.
- Lauf-Tickets nehmen Aufrüstungen und Kopfstart aus dem Tresor.
- Übernahme alter Spielstände (erster Abgleich): Rekord über 9.999 m zählt nur mit Beleg (Endlos-Rangliste / aufbewahrtes Replay) → Aurum/Platina/Kristallo hängen daran. Münzen, Sammlung, Aufrüstungen, Multiplikator im Rahmen des belegten Rekords (`trustBudget`); gerade erst angelegte Konten bekommen nur einen kleinen Rahmen.
- **Reparatur (ab 2.0.1):** Die Übernahme bis 2.0.0 hat zu hart gekürzt (Rekord 9.999 m → Aurum/Platina weg, Münzen 5.000, Sammlung ab 30.000 gelöscht). Beim nächsten Start holt der Server das einmal je Spieler zurück: Rekord aus der Rangliste, Höhen-Figuren, getragene Figur/Ausrüstung, Rest als Münzen, Aufrüstungen wie im Spitzen-Replay. Der Spieler sieht „Spielstand repariert“, die Zentrale zeigt „✅ Spielstand wiederhergestellt“.
- Kein Beleg vorhanden (nie in der Rangliste)? Zentrale → Anti-Cheat bzw. Endlos-Rangliste → „Rekord bestätigen“ → Meter eintragen. Freischaltung kommt beim nächsten Start.
Tests: `npm run test:vault`.

## Spielstand mit Google sichern
Freiwillig unter **Optionen → Spielstand sichern**. Die Anmeldung läuft auf `konto.html` im Browser (Google erlaubt sie nicht in App-Ansichten); das Spiel wartet auf das Ergebnis.
Gibt es zum Google-Konto schon einen Spielstand, zeigt das Spiel beide zum Vergleich und lädt den gespeicherten nur nach Bestätigung. Gespeichert werden nur Googles Konto-Nummer und die E-Mail-Adresse (`acct/…` in Netlify Blobs), Trennen jederzeit im Spiel oder in der Zentrale.
Einrichten (einmalig, ca. 10 Minuten):
1. <https://console.cloud.google.com> → Projekt anlegen → **Google Auth Platform → Branding**: App-Name „Sky Rush“, Support-E-Mail, Startseite `https://myskyrush.com`, Datenschutz `https://myskyrush.com/privacy.html`; Zielgruppe **Extern**, Status **In Produktion**. Nur die Standard-Bereiche (openid, email, profile) – dafür ist keine Google-Prüfung nötig.
2. **Clients → Client erstellen** → Typ **Webanwendung** → *Autorisierte JavaScript-Quellen*: `https://myskyrush.com` (und `https://myskyrush.netlify.app`) (und ggf. die eigene Domain). Weiterleitungs-URIs braucht es nicht.
3. Client-ID kopieren → **Zentrale → Einstellungen → Google-Anmeldung** → einfügen → Speichern. Ohne Client-ID ist die Funktion im Spiel unsichtbar.

## Zentrale → Einstellungen (ohne App-Update)
Werbe-Anbieter (AdMob, H5 Games Ads, Eigenwerbung) ein/aus, Testmodus, Anzeigenblöcke, Web-Publisher-ID, Testgeräte, Taktung, einzelne Platzierungen und Schätzwerte. Liegt auf dem Server (`/api/config`), gilt spätestens beim nächsten Spielstart. Feste Untergrenzen (z. B. mind. 90 s zwischen Werbepausen, höchstens 20 pro Tag) verhindern aufdringliche Werbung. AdMob-App-IDs stehen in der App selbst und ändern sich nur mit einem neuen App-Build.

## Duell-Varianten (nur eigene Räume)
Gastgeber wählt beim Anlegen (und im Warteraum über „ändern“): **Zeitrennen** (1 / 1,5 / 2 / 3 / 5 min) oder **K.O.** (ein Leben, bis nur einer übrig ist – höchstens 15 min) und **Kollision** an/aus.
Kollision: Wer auf jemandem landet, springt hoch, der andere fällt eine Ebene durch; seitliches Rammen schiebt eine Bahn weg. Treffer stehen im Eingabestrom (`S`, `P`, `k`) und werden am Ende auf dem Server nachgeprüft (erfundene oder ignorierte Treffer → disqualifiziert). Schnelles Rennen bleibt immer 90 s Standard. Tests: `npm run test:modes`.

## Sichtbarkeit (SEO · GEO · AEO)
`npm run deploy` baut vor dem Hochladen aus `www/` + `site/` den Ordner `.publish/` (die Apps bekommen davon nichts):
- Info-Seiten in 11 Sprachen (`/de/`, `/en/`, …) mit echtem Text, Spielmodi, lokalisierten Screenshots, FAQ, Store-Knöpfen (sobald `PLAY_URL`/`APPSTORE_URL` gesetzt sind)
- schema.org-Daten (VideoGame, WebSite, Organization, FAQPage, BreadcrumbList) – keine erfundenen Bewertungen
- hreflang (Startseite `/` = x-default), Open-Graph-Bilder je Sprache, `sitemap.xml` mit Bildern, `robots.txt` (KI-Crawler erlaubt), `llms.txt` + `llms-full.txt`
- Presse-Seite `/presse/` mit Fakten, Downloads, Einbau-Code für Verlinkungen
- IndexNow: Bing, Yandex, Naver werden nach jedem Deploy benachrichtigt (Schlüssel in `.skyrush.json` → `INDEXNOW_KEY`)
- Domain: `DOMAIN` in `.skyrush.json`, sonst die in Netlify als Primary verbundene Domain, sonst die Netlify-Adresse
Einstellungen: `npm run sichtbarkeit` (Domain, Store-Links, Social-Profile, Google-/Bing-Bestätigung). Inhalte: `site/content/<sprache>.json`. Test: `npm run test:seo`, lokal bauen: `npm run seo -- --origin https://myskyrush.com`.
