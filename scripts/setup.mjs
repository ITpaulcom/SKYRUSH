// npm run setup – fragt alles Nötige einmal ab und trägt es überall ein.
// Enter übernimmt den Wert in [Klammern]. Jederzeit erneut ausführbar.
import fs from 'node:fs';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const SAVE = '.skyrush.json';
const prev = fs.existsSync(SAVE) ? JSON.parse(fs.readFileSync(SAVE, 'utf8')) : {};
const rl = readline.createInterface({ input: stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
const ask = async (key, q, def = '') => {
  const d = prev[key] ?? def;
  stdout.write(`${q}${d ? ` [${d}]` : ''}: `);
  const { value, done } = await lines.next();
  if (!stdin.isTTY) stdout.write((value || '') + '\n');
  const a = done ? '' : String(value).trim();
  return (prev[key] = a || d);
};
const yes = async (key, q, def = 'n') => /^j|^y/i.test(await ask(key, q + ' (j/n)', def));

console.log('\n☁️  SKY RUSH – Einrichtung\n');
console.log('1/4  Angaben für Impressum & Datenschutz (Pflicht in DE)');
await ask('NAME', '  Vor- und Nachname', 'Paul Jan Wielpütz');
await ask('FIRMA', '  Firmen-/Markenname', 'ITpaul');
await ask('STRASSE', '  Straße und Hausnummer');
await ask('ORT', '  PLZ und Ort', '51503 Rösrath');
await ask('EMAIL', '  Support-E-Mail');
await ask('TELEFON', '  Telefon (optional)');
await ask('USTID', '  USt-IdNr. (optional)');

console.log('\n2/4  Netlify (Server + Web-Version) – leer lassen, `npm run deploy` trägt die Adresse selbst ein');
await ask('SITE', '  Adresse deiner Netlify-Seite, z. B. https://skyrush.netlify.app');

console.log('\n3/4  Werbung (AdMob) – Enter = Google-Test-Werbung behalten');
await ask('ADMOB_PUB', '  AdMob Publisher-ID (pub-…)');
await ask('ADMOB_ANDROID_APP', '  Android App-ID (ca-app-pub-…~…)');
await ask('ADMOB_ANDROID_REWARDED', '  Android Rewarded-Block-ID (…/…)');
await ask('ADMOB_ANDROID_INTER', '  Android Interstitial-Block-ID');
await ask('ADMOB_IOS_APP', '  iOS App-ID');
await ask('ADMOB_IOS_REWARDED', '  iOS Rewarded-Block-ID');
await ask('ADMOB_IOS_INTER', '  iOS Interstitial-Block-ID');
const cfgNow = fs.readFileSync('www/config.js', 'utf8');
const ownIds = /ca-app-pub-(?!3940256099942544)\d+\/\d+/.test(cfgNow);   // schon eigene IDs in config.js?
const hasAds = prev.ADMOB_ANDROID_REWARDED || prev.ADMOB_IOS_REWARDED || ownIds;
const live = hasAds ? await yes('LIVE', '  Echte Werbung aktivieren (Geld verdienen)?', /testMode: false/.test(cfgNow) ? 'j' : 'n') : false;

console.log('\n4/4  In-App-Käufe (RevenueCat) – optional');
await ask('RC_ANDROID', '  RevenueCat Android-Schlüssel (goog_…)');
await ask('RC_IOS', '  RevenueCat iOS-Schlüssel (appl_…)');
rl.close();

// ---------- config.js ----------
let c = fs.readFileSync('www/config.js', 'utf8');
const setStr = (re, val) => { if (val) c = c.replace(re, (m, a, b) => `${a}${val}${b}`); };
setStr(/(apiBase: ')[^']*(')/, prev.SITE.replace(/\/$/, ''));
setStr(/(androidAppId: ')[^']*(')/, prev.ADMOB_ANDROID_APP);
setStr(/(iosAppId:\s+')[^']*(')/, prev.ADMOB_IOS_APP);
setStr(/(android: \{\s+rewarded:\s+')[^']*(')/, prev.ADMOB_ANDROID_REWARDED);
setStr(/(android: \{[\s\S]*?interstitial: ')[^']*(')/, prev.ADMOB_ANDROID_INTER);
setStr(/(ios: \{\s+rewarded:\s+')[^']*(')/, prev.ADMOB_IOS_REWARDED);
setStr(/(ios: \{[\s\S]*?interstitial: ')[^']*(')/, prev.ADMOB_IOS_INTER);
setStr(/(androidKey: ')[^']*(')/, prev.RC_ANDROID);
setStr(/(iosKey: ')[^']*(')/, prev.RC_IOS);
c = c.replace(/testMode: (true|false)/, `testMode: ${!live}`);
if (prev.EMAIL) c = c.replace(/(support: ')[^']*(')/, `$1mailto:${prev.EMAIL}$2`);
fs.writeFileSync('www/config.js', c);

// ---------- Impressum, Datenschutz, app-ads.txt ----------
for (const [tpl, out] of [['legal/impressum.tpl.html', 'www/impressum.html'], ['legal/privacy.tpl.html', 'www/privacy.html']]) {
  let h = fs.readFileSync(tpl, 'utf8');
  for (const k of ['NAME', 'FIRMA', 'STRASSE', 'ORT', 'EMAIL', 'TELEFON', 'USTID']) h = h.replaceAll(`{{${k}}}`, (prev[k] || '–').replace(/[<>&]/g, ''));
  fs.writeFileSync(out, h);
}
if (prev.ADMOB_PUB && !/pub-\d{16}/.test(fs.readFileSync('www/app-ads.txt', 'utf8'))) fs.writeFileSync('www/app-ads.txt', `google.com, ${prev.ADMOB_PUB.replace(/^ca-app-/, '')}, DIRECT, f08c47fec0942fa0\n`);

// ---------- Admin-Schlüssel ----------
let env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
if (!/ADMIN_TOKEN=/.test(env)) { env += `ADMIN_TOKEN=${crypto.randomBytes(24).toString('base64url')}\n`; fs.writeFileSync('.env', env); }
const token = env.match(/ADMIN_TOKEN=(.*)/)[1];

fs.writeFileSync(SAVE, JSON.stringify(prev, null, 2));
console.log(`
✅ Fertig eingetragen.
   • Werbung: ${live ? 'ECHT (Store-Version)' : 'Test-Anzeigen'}
   • Admin-Schlüssel für /admin.html: ${token}
Weiter mit:  npm run deploy
`);
