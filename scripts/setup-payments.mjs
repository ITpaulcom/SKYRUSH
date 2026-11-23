// Zahlungen & iOS-Werbung einrichten – fragt nur die Schlüssel ab und trägt sie in www/config.js ein.
// Enter übernimmt den Wert in [Klammern]. Jederzeit erneut ausführbar. Nichts wird ins Internet geschickt.
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const SAVE = '.skyrush.json', CFG = 'www/config.js';
const prev = fs.existsSync(SAVE) ? JSON.parse(fs.readFileSync(SAVE, 'utf8')) : {};
let c = fs.readFileSync(CFG, 'utf8');
const cur = re => (c.match(re) || [])[1] || '';
const rl = readline.createInterface({ input: stdin, terminal: false }), lines = rl[Symbol.asyncIterator]();
async function ask(key, q, def, check) {
  for (;;) {
    stdout.write(`${q}${def ? ` [${def}]` : ''}: `);
    const { value, done } = await lines.next();
    const a = (done ? '' : String(value)).trim() || def || '';
    if (!a || !check || check(a)) return (prev[key] = a);
    console.log('   ✖ Das sieht nicht richtig aus – bitte nochmal (oder Enter zum Überspringen).');
  }
}

console.log('\n💳  SKY DUELL – Zahlungen einrichten (Google Play & Apple über RevenueCat)\n');
console.log('Die Schlüssel findest du in RevenueCat → Projekt → „API keys“ → „Public app-specific API keys“.');
console.log('Genaue Schritte: „ZAHLUNGEN - Anleitung.html“ im Sky-Duell-Ordner auf dem Desktop.\n');
const rcA = await ask('RC_ANDROID', '  RevenueCat Google-Play-Schlüssel (goog_…)', cur(/androidKey: '([^']*)'/), v => /^goog_[A-Za-z0-9]{10,}$/.test(v));
const rcI = await ask('RC_IOS', '  RevenueCat App-Store-Schlüssel (appl_…)', cur(/iosKey: '([^']*)'/), v => /^appl_[A-Za-z0-9]{10,}$/.test(v));
console.log('\n🔒  Kauf-Prüfung auf dem Server (gegen gefälschte Käufe): RevenueCat → API keys → „Secret API keys“ → + New (v1)');
console.log('   Dieser Schlüssel bleibt geheim: Er kommt NICHT in die App, nur in .env und von dort auf deinen Netlify-Server.');
let envTxt = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const curSec = (envTxt.match(/REVENUECAT_SECRET=(.*)/) || [])[1] || '';
const rcS = await ask('_RC_SECRET', '  RevenueCat Secret Key (sk_…)', curSec ? curSec.slice(0, 6) + '…(gespeichert)' : '', v => /^sk_[A-Za-z0-9]{10,}$/.test(v) || v.endsWith('(gespeichert)'));
delete prev._RC_SECRET;
if (rcS && !rcS.endsWith('(gespeichert)')) { envTxt = envTxt.replace(/REVENUECAT_SECRET=.*\n?/, '') + `REVENUECAT_SECRET=${rcS}\n`; fs.writeFileSync('.env', envTxt); }

console.log('\n📱  iOS-Werbung (AdMob → Apps → Sky Duell iOS) – Enter = später');
const curIos = cur(/iosAppId:\s+'([^']*)'/);
const iosApp = await ask('ADMOB_IOS_APP', '  iOS App-ID (ca-app-pub-…~…)', curIos.startsWith('ca-app-pub-3940256099942544') ? '' : curIos, v => /^ca-app-pub-\d{16}~\d{10}$/.test(v));
rl.close();

const setStr = (re, val) => { if (val) c = c.replace(re, (m, a, b) => `${a}${val}${b}`); };
setStr(/(androidKey: ')[^']*(')/, rcA);
setStr(/(iosKey: ')[^']*(')/, rcI);
setStr(/(iosAppId:\s+')[^']*(')/, iosApp);
fs.writeFileSync(CFG, c);
fs.writeFileSync(SAVE, JSON.stringify(prev, null, 2));

console.log('\n✔ Eingetragen in www/config.js:');
console.log(`   Google Play Käufe : ${rcA ? 'aktiv' : '— (noch kein Schlüssel)'}`);
console.log(`   Apple Käufe       : ${rcI ? 'aktiv' : '— (noch kein Schlüssel)'}`);
console.log(`   iOS-Werbung       : ${iosApp ? 'echte Werbung' : 'Test-Werbung, bis die iOS App-ID eingetragen ist'}`);
console.log(`   Kauf-Prüfung      : ${/REVENUECAT_SECRET=sk_/.test(fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '') ? 'aktiv (wird beim nächsten Online-Stellen auf den Server übertragen)' : '— (ohne Secret Key werden Käufe vom Gerät übernommen und nur vermerkt)'}`);
console.log('\nProdukt-IDs, die in Play Console / App Store Connect / RevenueCat angelegt sein müssen:');
console.log('   skyrush_remove_ads   (Werbefrei, einmalig – in RevenueCat an Berechtigung „no_ads“ hängen)');
console.log('   skyrush_starter      (Starterpaket, Verbrauchsartikel)');
console.log('   skyrush_coins_small / _medium / _large / _huge   (Münzpakete, Verbrauchsartikel)\n');
