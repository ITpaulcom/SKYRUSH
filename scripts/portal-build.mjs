// node scripts/portal-build.mjs [crazygames|poki|alle] – baut die ZIP-Datei für Web-Spieleportale.
// Kopie von www mit: Vertriebsweg gesetzt (Werbung über das Portal-SDK, kein Echtgeld-Shop, keine fremden Links),
// Server-Adresse fest auf myskyrush.netlify.app (funktioniert immer, auch für alte Apps), ohne Zentrale. Ergebnis: builds\SkyRush-<Portal>.zip
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://myskyrush.netlify.app';
const SKIP = new Set(['admin.html', 'sw.js', 'konto.html', 'store-import', 'ads.txt', 'app-ads.txt', '.DS_Store']);
const arg = (process.argv[2] || 'alle').toLowerCase();
const list = arg === 'alle' ? ['crazygames', 'poki'] : [arg];
if (!list.every(p => ['crazygames', 'poki'].includes(p))) { console.log('Unbekanntes Portal. Erlaubt: crazygames, poki, alle'); process.exit(1); }

function files(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...files(path.join(dir, e.name), rel)); else out.push(rel);
  }
  return out;
}

// Minimaler ZIP-Schreiber (Deflate) – keine Zusatzprogramme nötig
function zip(entries) {
  const parts = [], central = []; let off = 0;
  const dosT = 0, dosD = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const [name, data] of entries) {
    const nb = Buffer.from(name, 'utf8'), comp = zlib.deflateRawSync(data, { level: 9 }), crc = zlib.crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(dosT, 10); h.writeUInt16LE(dosD, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nb.length, 26);
    parts.push(h, nb, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dosT, 12); c.writeUInt16LE(dosD, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nb);
    off += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

const WWW = path.join(ROOT, 'www');
fs.mkdirSync(path.join(ROOT, 'builds'), { recursive: true });
for (const portal of list) {
  const entries = [];
  for (const rel of files(WWW)) {
    let data = fs.readFileSync(path.join(WWW, rel));
    if (rel === 'channel.js') data = Buffer.from(`// Portal-Build (${portal}) – automatisch erzeugt\nexport const CHANNEL = '${portal}';\n`);
    if (rel === 'config.js') {
      let t = data.toString('utf8');
      if (!/apiBase:\s*'https?:/.test(t)) t = t.replace(/apiBase:\s*'[^']*'/, `apiBase: '${SITE}'`);
      if (!t.includes(`apiBase: '${SITE}'`) && !/apiBase:\s*'https?:/.test(t)) { console.log('✖ apiBase in config.js nicht gefunden'); process.exit(1); }
      data = Buffer.from(t);
    }
    if (rel === 'index.html') {   // kein PWA-Manifest/Store-Hinweis im Portal
      data = Buffer.from(data.toString('utf8').replace(/<link rel="manifest"[^>]*>\s*/g, ''));
    }
    entries.push([rel, data]);
  }
  const out = path.join(ROOT, 'builds', `SkyRush-${portal === 'crazygames' ? 'CrazyGames' : 'Poki'}.zip`);
  fs.writeFileSync(out, zip(entries));
  console.log(`✅ ${path.relative(ROOT, out)}  (${entries.length} Dateien, ${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
}
console.log('\nHochladen: CrazyGames → developer.crazygames.com · Poki → developers.poki.com (index.html liegt oben in der ZIP).');
