// Schreibt AdMob-IDs, Hochformat und Tracking-Hinweis in die nativen Projekte.
// Mehrfach ausführbar (idempotent). Aufruf: npm run configure  (nach `npx cap add android/ios`)
import fs from 'node:fs';
import { CONFIG } from '../www/config.js';

const done = [];
// ---------- Android ----------
const man = 'android/app/src/main/AndroidManifest.xml';
if (fs.existsSync(man)) {
  let x = fs.readFileSync(man, 'utf8');
  if (!x.includes('com.google.android.gms.ads.APPLICATION_ID'))
    x = x.replace(/(<application[^>]*>)/, `$1\n        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="@string/admob_app_id" />`);
  // Hoch- und Querformat (folgt der Drehsperre des Handys): quer sieht man mehr Bahnen
  if (x.includes('android:screenOrientation="portrait"')) x = x.replace('android:screenOrientation="portrait"', 'android:screenOrientation="fullUser"');
  else if (!x.includes('android:screenOrientation'))
    x = x.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="fullUser"');
  // Controller: Spiel unterstützt Gamepads (kein Muss – Touch bleibt Hauptsteuerung)
  if (!x.includes('android.hardware.gamepad'))
    x = x.replace(/(\s*)<uses-permission android:name="android.permission.INTERNET" \/>/, m => `${m}\n    <uses-feature android:name="android.hardware.gamepad" android:required="false" />`);
  fs.writeFileSync(man, x);
  const str = 'android/app/src/main/res/values/strings.xml';
  let s = fs.readFileSync(str, 'utf8');
  s = s.includes('admob_app_id')
    ? s.replace(/<string name="admob_app_id">[^<]*<\/string>/, `<string name="admob_app_id">${CONFIG.ads.androidAppId}</string>`)
    : s.replace('</resources>', `    <string name="admob_app_id">${CONFIG.ads.androidAppId}</string>\n</resources>`);
  fs.writeFileSync(str, s);
  done.push('Android');
}
// ---------- iOS ----------
const pl = 'ios/App/App/Info.plist';
if (fs.existsSync(pl)) {
  let x = fs.readFileSync(pl, 'utf8');
  const setKey = (key, xmlValue) => {
    const re = new RegExp(`\\s*<key>${key}</key>\\s*(<string>[^<]*</string>|<true/>|<false/>|<array>[\\s\\S]*?</array>)`);
    x = x.replace(re, '');
    x = x.replace(/<dict>/, `<dict>\n\t<key>${key}</key>\n\t${xmlValue}`);
  };
  setKey('GADApplicationIdentifier', `<string>${CONFIG.ads.iosAppId}</string>`);
  setKey('NSUserTrackingUsageDescription', '<string>Damit können dir passendere Anzeigen gezeigt werden. Das Spiel funktioniert auch ohne Zustimmung.</string>');
  // Google-Netzwerk-ID; weitere IDs der Werbepartner aus Googles iOS-Anleitung ergänzen (siehe RELEASE.md)
  setKey('SKAdNetworkItems', '<array>\n\t\t<dict>\n\t\t\t<key>SKAdNetworkIdentifier</key>\n\t\t\t<string>cstr6suwn9.skadnetwork</string>\n\t\t</dict>\n\t</array>');
  setKey('UISupportedInterfaceOrientations', '<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>');
  setKey('UISupportedInterfaceOrientations~ipad', '<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t\t<string>UIInterfaceOrientationPortraitUpsideDown</string>\n\t</array>');
  setKey('UIRequiresFullScreen', '<true/>');
  setKey('UIStatusBarHidden', '<true/>');
  setKey('UIViewControllerBasedStatusBarAppearance', '<false/>');
  setKey('ITSAppUsesNonExemptEncryption', '<false/>');
  // Controller (Xbox, PlayStation, MFi …): Spiel bedient Controller selbst – App Store zeigt „Controller unterstützt“
  setKey('GCSupportsControllerUserInteraction', '<true/>');
  setKey('GCSupportedGameControllers', '<array>\n\t\t<dict>\n\t\t\t<key>ProfileName</key>\n\t\t\t<string>ExtendedGamepad</string>\n\t\t</dict>\n\t</array>');
  fs.writeFileSync(pl, x);
  done.push('iOS');
}
console.log(done.length ? `Konfiguriert: ${done.join(', ')}` : 'Keine nativen Projekte gefunden – erst `npx cap add android` / `npx cap add ios` ausführen.');
if (CONFIG.ads.testMode) console.log('Hinweis: ads.testMode ist noch true – vor dem Release in www/config.js auf false setzen.');
