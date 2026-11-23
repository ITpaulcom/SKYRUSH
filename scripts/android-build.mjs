// npm run build:android – baut die Play-Store-Datei (.aab) ohne Android Studio.
// node scripts/android-build.mjs galaxy – baut die APK für den Samsung Galaxy Store (nur Werbung, ohne Google-Käufe).
// Lädt beim ersten Mal Java 21 und das Android-SDK nach .tools/ (nur in diesen Projektordner, keine Installation).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const GALAXY = process.argv.slice(2).includes('galaxy');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const WIN = process.platform === 'win32';
const TOOLS = path.join(ROOT, '.tools');
const SDK = path.join(TOOLS, 'android-sdk');
const LOG = path.join(TOOLS, 'build.log');
fs.mkdirSync(TOOLS, { recursive: true });
fs.writeFileSync(LOG, `Start ${new Date().toISOString()}\n`);

const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(LOG, s + '\n'); };
const fail = msg => { log(`\n✖ ${msg}`); process.exit(1); };
const step = (n, t) => log(`\n[${n}/6] ${t}`);

const JDK_URL = 'https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip';
const SDK_URL = 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip';
const SDK_SHA = '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a';

function run(cmd, args, opts = {}) {
  // .bat/.cmd brauchen unter Windows eine Shell; Pfade werden einzeln in Anführungszeichen gesetzt.
  const line = [cmd, ...args].map(x => /[\s;]/.test(x) ? `"${x}"` : x).join(' ');
  fs.appendFileSync(LOG, `$ ${line}\n`);
  const r = spawnSync(line, { shell: true, stdio: opts.input ? ['pipe', 'inherit', 'inherit'] : 'inherit', input: opts.input, env: ENV, cwd: opts.cwd || ROOT });
  if (r.status !== 0) fail(`Befehl fehlgeschlagen (${r.status}): ${line}\nDetails siehe Ausgabe oben bzw. .tools\\build.log`);
}

async function download(url, file, sha) {
  log(`  Lade ${url.split('/').pop()} …`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) fail(`Download fehlgeschlagen: HTTP ${res.status} (${url})`);
  const total = +res.headers.get('content-length') || 0;
  const out = fs.createWriteStream(file); const hash = crypto.createHash('sha256');
  let got = 0, last = 0;
  for await (const chunk of res.body) {
    out.write(chunk); hash.update(chunk); got += chunk.length;
    if (total && got - last > total / 20) { last = got; process.stdout.write(`\r  ${Math.round(got / total * 100)} %  `); }
  }
  await new Promise(r => out.end(r));
  process.stdout.write('\r  100 %   \n');
  if (sha && hash.digest('hex') !== sha) fail('Prüfsumme stimmt nicht – Download beschädigt. Bitte erneut starten.');
}

function unzip(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  // tar.exe ist in Windows 10/11 enthalten und kann ZIP entpacken.
  run('tar', ['-xf', zip, '-C', dest]);
  fs.rmSync(zip, { force: true });
}

const findJdk = () => fs.readdirSync(TOOLS).filter(d => /^jdk-21/.test(d)).map(d => path.join(TOOLS, d)).find(d => fs.existsSync(path.join(d, 'bin', WIN ? 'java.exe' : 'java')));

let ENV = { ...process.env };

if (!WIN) fail('Dieses Skript ist für Windows gedacht. Auf dem Mac/Linux: Android Studio oder Codemagic verwenden.');

// ---------- 1. Java ----------
step(1, 'Java 21');
let JDK = findJdk();
if (!JDK) { await download(JDK_URL, path.join(TOOLS, 'jdk.zip')); unzip(path.join(TOOLS, 'jdk.zip'), TOOLS); JDK = findJdk(); }
if (!JDK) fail(`Java wurde entpackt, aber nicht gefunden. Inhalt von .tools: ${fs.readdirSync(TOOLS).join(', ')}`);
ENV.JAVA_HOME = JDK; ENV.ANDROID_HOME = SDK; ENV.ANDROID_SDK_ROOT = SDK;
ENV.PATH = path.join(JDK, 'bin') + path.delimiter + (process.env.PATH || process.env.Path || '');
delete ENV.Path;
log(`  ✔ ${JDK}`);

// ---------- 2. Android-Werkzeuge ----------
step(2, 'Android-Werkzeuge');
const SDKM = path.join(SDK, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
if (!fs.existsSync(SDKM)) {
  const tmp = path.join(TOOLS, 'cmdtools-tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  await download(SDK_URL, path.join(TOOLS, 'cmdtools.zip'), SDK_SHA);
  unzip(path.join(TOOLS, 'cmdtools.zip'), tmp);
  fs.mkdirSync(path.join(SDK, 'cmdline-tools'), { recursive: true });
  fs.renameSync(path.join(tmp, 'cmdline-tools'), path.join(SDK, 'cmdline-tools', 'latest'));
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (!fs.existsSync(SDKM)) fail('sdkmanager fehlt nach dem Entpacken.');
log('  ✔ vorhanden');

// ---------- 3. Lizenzen + SDK-Pakete ----------
step(3, 'Android-SDK (Android 16)');
if (!fs.existsSync(path.join(SDK, 'licenses', 'android-sdk-license'))) {
  console.log('\n  Google verlangt die Zustimmung zu den Android-SDK-Lizenzbedingungen:\n  https://developer.android.com/studio/terms');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question('  Lizenzbedingungen akzeptieren? (j/n): ')).trim();
  rl.close();
  if (!/^[jy]/i.test(a)) fail('Ohne Zustimmung kann Google die Android-Werkzeuge nicht bereitstellen.');
  run(SDKM, [`--sdk_root=${SDK}`, '--licenses'], { input: 'y\n'.repeat(60) });
}
if (!fs.existsSync(path.join(SDK, 'platforms', 'android-36'))) run(SDKM, [`--sdk_root=${SDK}`, 'platform-tools', 'platforms;android-36', 'build-tools;36.0.0']);
fs.writeFileSync(path.join(ROOT, 'android', 'local.properties'), `sdk.dir=${SDK.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);
log('  ✔ bereit');

// ---------- 4. Upload-Schlüssel ----------
step(4, 'Upload-Schlüssel');
const KSP = path.join(ROOT, 'android', 'keystore.properties');
const JKS = path.join(ROOT, 'skyrush-upload.jks');
if (!fs.existsSync(KSP)) {
  if (fs.existsSync(JKS)) fail('skyrush-upload.jks existiert, aber android\\keystore.properties fehlt. Datei mit Passwort wiederherstellen (siehe SCHLUESSEL-SICHERN.txt).');
  const pw = 'Sky' + crypto.randomBytes(16).toString('hex');   // nur Buchstaben/Ziffern – sicher für keytool
  run(path.join(JDK, 'bin', 'keytool.exe'), ['-genkeypair', '-keystore', JKS, '-alias', 'upload', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-storepass', pw, '-keypass', pw, '-dname', 'CN=Paul Jan Wielpuetz, O=ITpaul, L=Roesrath, C=DE']);
  fs.writeFileSync(KSP, `storeFile=../../skyrush-upload.jks\nstorePassword=${pw}\nkeyAlias=upload\nkeyPassword=${pw}\n`);
  fs.writeFileSync(path.join(ROOT, 'SCHLUESSEL-SICHERN.txt'),
    `SKY DUELL – UPLOAD-SCHLÜSSEL (sicher aufbewahren, z. B. USB-Stick + Passwort-Manager)\r\n\r\nDatei:    skyrush-upload.jks\r\nAlias:    upload\r\nPasswort: ${pw}\r\n\r\nOhne Datei + Passwort kannst du keine Updates hochladen.\r\n(Bei Verlust: Google Play Console → App-Signatur → Upload-Schlüssel zurücksetzen.)\r\n`);
  log('  ✔ neu erzeugt – siehe SCHLUESSEL-SICHERN.txt');
} else log('  ✔ vorhanden');

// ---------- 5. Version ----------
step(5, 'Versionsnummer');
const VCF = path.join(ROOT, 'android', 'versionCode.txt');
const vc = (parseInt(fs.existsSync(VCF) ? fs.readFileSync(VCF, 'utf8') : '0', 10) || 0) + 1;
log(`  Version ${vc}`);

// ---------- 6. Bauen ----------
step(6, 'App bauen (dauert beim ersten Mal 5–10 Minuten)');
run('node', ['scripts/configure-native.mjs']);
run('npx', ['cap', 'sync', 'android']);
if (GALAXY) {
  // Galaxy Store: Vertriebsweg in der App-Kopie setzen und die Google-Play-Kaufberechtigung entfernen (Samsung erlaubt keine Google-Käufe)
  fs.writeFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'public', 'channel.js'), "// Galaxy-Build – automatisch erzeugt\nexport const CHANNEL = 'galaxy';\n");
  const MF = path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), orig = fs.readFileSync(MF, 'utf8');
  process.on('exit', () => { try { fs.writeFileSync(MF, orig); } catch {} });   // Original immer zurück – auch bei Fehlern
  fs.writeFileSync(MF, orig.replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android"', '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"')
    .replace('<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="com.android.vending.BILLING" tools:node="remove" />'));
  run(path.join(ROOT, 'android', 'gradlew.bat'), ['assembleRelease', `-PversionCode=${vc}`, '--no-daemon', '--console=plain'], { cwd: path.join(ROOT, 'android') });
  const apk = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (!fs.existsSync(apk)) fail('Build lief durch, aber die .apk-Datei fehlt.');
  fs.mkdirSync(path.join(ROOT, 'builds'), { recursive: true });
  const outApk = path.join(ROOT, 'builds', `SkyRush-Galaxy-v${vc}.apk`);
  fs.copyFileSync(apk, outApk);
  fs.writeFileSync(VCF, String(vc));
  // Normale App-Kopie wiederherstellen, damit der nächste Play-Build nicht versehentlich „galaxy“ enthält
  fs.copyFileSync(path.join(ROOT, 'www', 'channel.js'), path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'public', 'channel.js'));
  log(`\n✅ FERTIG: builds\\${path.basename(outApk)} (${(fs.statSync(outApk).size / 1048576).toFixed(1)} MB)\n   Diese Datei im Samsung Seller Portal hochladen (seller.samsungapps.com).`);
  process.exit(0);
}
run(path.join(ROOT, 'android', 'gradlew.bat'), ['bundleRelease', `-PversionCode=${vc}`, '--no-daemon', '--console=plain'], { cwd: path.join(ROOT, 'android') });
const aab = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
if (!fs.existsSync(aab)) fail('Build lief durch, aber die .aab-Datei fehlt.');
fs.mkdirSync(path.join(ROOT, 'builds'), { recursive: true });
const outFile = path.join(ROOT, 'builds', `SkyRush-PlayStore-v${vc}.aab`);
fs.copyFileSync(aab, outFile);
// R8-Zuordnungsdatei sichern (steckt auch im .aab; Kopie nur als Backup fuer Absturzberichte)
const map = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'mapping', 'release', 'mapping.txt');
if (fs.existsSync(map)) fs.copyFileSync(map, path.join(ROOT, 'builds', `SkyRush-PlayStore-v${vc}-mapping.txt`));
fs.writeFileSync(VCF, String(vc));   // erst nach Erfolg hochzählen
log(`\n✅ FERTIG: builds\\${path.basename(outFile)} (${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB)\n   Diese Datei in der Google Play Console hochladen.\n   WICHTIG: skyrush-upload.jks + SCHLUESSEL-SICHERN.txt sicher aufbewahren!`);
