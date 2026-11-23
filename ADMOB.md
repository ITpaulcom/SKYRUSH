# Werbung einrichten (AdMob) – Schritt für Schritt

Dauer: ca. 30 Minuten Klickarbeit plus Wartezeiten bei Google. Die Bezeichnungen in AdMob können leicht abweichen. Google ändert die Oberfläche gelegentlich.

## A. Konto (einmalig)
1. **admob.google.com** öffnen, mit deinem Google-Konto anmelden und **Registrieren** wählen.
2. Land **Deutschland**, Zeitzone **Berlin**, Währung **EUR** wählen und die Bedingungen akzeptieren.
3. **Zahlungen → Zahlungsinformationen**: Name, Adresse und Kontoart (Unternehmen bei ITpaul) eintragen.
4. **Zahlungen → Einstellungen → Steuerinformationen** ausfüllen. Als Unternehmer gibst du deine USt-IdNr. an.
5. **Einstellungen → Kontoinformationen**: die **Publisher-ID** (`pub-…`) notieren.

Google prüft neue Konten, das kann einige Tage dauern. Ausgezahlt wird monatlich, sobald der Auszahlungsschwellenwert erreicht ist (steht unter *Zahlungen*). Beim ersten Mal kommt außerdem eine PIN per Post, die du in AdMob bestätigst.

## B. Zwei Apps anlegen
Für **Android** und **iOS** je einmal:
1. **Apps → App hinzufügen**.
2. Plattform wählen. Bei „Ist die App in einem App-Shop gelistet?“ **Nein** wählen (noch nicht veröffentlicht).
3. App-Name **Sky Duell** eingeben, Nutzermesswerte eingeschaltet lassen, dann **App hinzufügen**.
4. Die **App-ID** notieren (`ca-app-pub-…~…`, mit Tilde).

## C. Anzeigenblöcke anlegen
In jeder der beiden Apps unter **Anzeigenblöcke → Anzeigenblock hinzufügen**:

| Format in AdMob | Name (frei wählbar) | Einstellungen |
|---|---|---|
| **Prämie** (Rewarded) | `SR Rewarded` | Prämienbetrag `1`, Artikel `Bonus` (das Spiel vergibt die Belohnung selbst), Rest Standard |
| **Interstitial** | `SR Pause` | Anzeigentypen: Bild/Text **und** Video, Rest Standard |

Notiere die vier **Anzeigenblock-IDs** (`ca-app-pub-…/…`, mit Schrägstrich).

## D. Einwilligung (Pflicht in der EU)
1. **Datenschutz und Mitteilungen → DSGVO → Mitteilung erstellen**.
2. Beide Apps auswählen und Sprachen **Deutsch** und **Englisch** hinzufügen.
3. Bei **Datenschutzerklärung-URL** `https://<deine-seite>.netlify.app/privacy.html` eintragen (die Adresse zeigt dir `deploy` an).
4. Bei Werbepartnern „Häufig verwendete Werbepartner“ lassen, dann **Veröffentlichen**.
5. Für iOS zusätzlich: **Datenschutz und Mitteilungen → IDFA-Erklärung → Mitteilung erstellen → Veröffentlichen**.

Das Spiel zeigt diese Abfrage beim ersten Start automatisch an. In den Optionen gibt es den Punkt „Datenschutz-Einstellungen (Werbung)“, um die Wahl zu ändern.

## E. IDs ins Spiel eintragen
1. `SKY-RUSH-DEPLOY.bat` doppelklicken. Falls die Einrichtung schon gelaufen ist, im Ordner `npm run setup` ausführen.
2. Publisher-ID, beide App-IDs und die vier Block-IDs eintragen.
3. Bei **„Echte Werbung aktivieren?“** gilt:
   - **n** für Tests auf deinem Handy (dann kommen Google-Test-Anzeigen, du verdienst nichts, kannst aber gefahrlos tippen).
   - **j** erst für die Version, die in die Stores geht.
4. `npm run deploy` ausführen (läuft in der `.bat` automatisch). Damit liegt **app-ads.txt** online und die Apps bekommen die IDs.
5. App neu bauen (`npm run android` bzw. Codemagic für iOS).

## F. Nach der Store-Veröffentlichung
1. **Store verknüpfen**: AdMob → App → **App-Einstellungen → App-Shop-Details hinzufügen** → App suchen und verknüpfen. Danach prüft Google die App („App-Bereitschaft“). Bis das durch ist, laufen nur wenige Anzeigen.
2. **app-ads.txt**: In der Play Console (*Store-Eintrag → Kontaktdaten → Website*) und in App Store Connect (*Marketing-URL*) **genau die Netlify-Adresse** eintragen, z. B. `https://skyrush-ab12c.netlify.app`. Dann in AdMob unter **Apps → app-ads.txt → Nach Updates suchen** prüfen. Das kann bis zu 24 h dauern.
3. Optional für mehr Umsatz: **Mediation → Mediationsgruppe erstellen**, Format Prämie bzw. Interstitial. Bidding-Partner hinzufügen (AppLovin, Unity Ads, Meta Audience Network, Liftoff/Vungle). Für jeden Partner brauchst du dort ein eigenes Konto. Bei iOS die SKAdNetwork-IDs der Partner in `ios/App/App/Info.plist` ergänzen.

## G. Einnahmen maximieren (ohne Spieler zu vergraulen)
Das Spiel ist bereits auf möglichst viele **freiwillige** Videos ausgelegt. Diese haben die höchsten eCPMs, und Spieler schauen sie gern, weil sie einen echten Gegenwert bekommen.

| Platzierung im Spiel | Wann sie erscheint |
|---|---|
| Zweite Chance | nach dem Absturz (1× pro Lauf) |
| Münzen verdoppeln | Ergebnis-Bildschirm |
| Kopfstart | Startbildschirm, wenn keine Marke vorrätig ist |
| Truhe verdoppeln | nach jedem Truhen-Öffnen |
| Glücksrad – zweiter Dreh | täglich |
| Tagesserie doppelt | täglich beim ersten Start |
| Gratis-Münzen | Shop, 3× pro Tag |
| Turnier-Extra-Versuch | wöchentlich |
| Werbepause (Interstitial) | ab dem 4. Lauf höchstens nach jedem 2. Lauf, mind. 120 s Abstand, max. 15/Tag |

So holst du mehr heraus:
1. **Mediation mit Bidding einschalten** (Abschnitt F.3). Das bringt meist den größten Sprung, weil mehrere Netzwerke um jede Anzeige bieten.
2. **Einwilligungsrate**: Personalisierte Anzeigen bringen ein Vielfaches. Die Google-Mitteilung (Abschnitt D) freundlich formulieren, die Schaltflächen nicht verstecken. Fair bleiben ist dabei Pflicht.
3. **In `/admin.html` unter „Platzierungen“** siehst du, welche Stellen am meisten bringen. Gute Stellen kannst du prominenter machen, ungenutzte entfernen.
4. **Werbepausen nicht verschärfen**, bevor du die Bindung kennst: In der Play Console unter *Statistiken → Bindung* die Tag-1- und Tag-7-Rückkehrquoten beobachten. Sinken sie, bringt mehr Werbung am Ende weniger.
5. **eCPM-Untergrenzen** (Floors) erst setzen, wenn genug Daten da sind (einige Wochen). Zu hohe Floors senken die Füllrate.
6. **„Werbefrei“-Kauf** anbieten (ist eingebaut). Viele Vielspieler kaufen ihn, und die Belohnungsvideos bleiben trotzdem verfügbar.

## H. Regeln, die dein Konto schützen
- **Nie** auf echte eigene Anzeigen tippen und niemanden dazu auffordern. Zum Testen immer die Test-Anzeigen nutzen (Antwort **n** in E.3) oder dein Handy unter **Einstellungen → Testgeräte** eintragen.
- Belohnte Videos nur freiwillig anbieten, nie als einzigen Weg weiter. Das Spiel ist bereits so gebaut.
- Werbepausen nur zwischen Läufen, nie mitten im Spiel. Auch das ist bereits so eingestellt.

## I. Umsatz ansehen
- **AdMob → Startseite / Berichte**: offizielle Zahlen, maßgeblich für die Auszahlung.
- **`/admin.html`** auf deiner Seite: Umsatz pro Tag, eCPM und Umsatz pro Nutzer, direkt aus dem Spiel gemeldet.
