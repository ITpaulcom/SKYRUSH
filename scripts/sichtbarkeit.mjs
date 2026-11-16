// Sichtbarkeit einrichten – fragt Domain, Store-Links, Social-Profile und die Bestätigungs-Codes von Google/Bing ab
// und speichert sie in .skyrush.json. Beim nächsten Deploy landen sie in Info-Seiten, strukturierten Daten und llms.txt.
// Enter übernimmt den Wert in [Klammern], „-“ löscht ihn. Jederzeit erneut ausführbar. Nichts wird ins Internet geschickt.
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const SAVE = '.skyrush.json';
const prev = fs.existsSync(SAVE) ? JSON.parse(fs.readFileSync(SAVE, 'utf8')) : {};
const rl = readline.createInterface({ input: stdin, terminal: false }), lines = rl[Symbol.asyncIterator]();
async function ask(key, q, check, clean = v => v) {
  const def = Array.isArray(prev[key]) ? prev[key].join(' ') : prev[key] || '';
  for (;;) {
    stdout.write(`${q}${def ? ` [${def}]` : ''}: `);
    const { value, done } = await lines.next();
    let a = (done ? '' : String(value)).trim();
    if (a === '-') { delete prev[key]; return; }
    if (!a) return;
    a = clean(a);
    if (!check || check(a)) { prev[key] = a; return; }
    console.log('   ✖ Das sieht nicht richtig aus – bitte nochmal (Enter = so lassen, „-“ = löschen).');
  }
}
const url = v => /^https:\/\/[^\s]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(v);
const meta = v => (v.match(/content="([^"]+)"/) || [])[1] || v;   // ganzes <meta …>-Tag oder nur der Code

console.log('\n🔎  SKY RUSH – Sichtbarkeit (Google, Bing, KI-Suchen) einrichten\n');
console.log('Genaue Schritte: „SICHTBARKEIT - Anleitung.html“ im Sky-Rush-Ordner auf dem Desktop.\n');
await ask('DOMAIN', '  Deine Domain, z. B. myskyrush.com (leer = Netlify-Adresse bzw. die in Netlify verbundene Domain)', v => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v), v => v.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase());
await ask('PLAY_URL', '  Google-Play-Link (erst eintragen, wenn die App öffentlich ist)', v => url(v) && v.includes('play.google.com'));
await ask('APPSTORE_URL', '  App-Store-Link (erst eintragen, wenn die App öffentlich ist)', v => url(v) && v.includes('apps.apple.com'));
console.log('\n  Social-Profile (TikTok, YouTube, Instagram, X, Discord …) – mehrere mit Leerzeichen trennen');
await ask('SOCIAL', '  Profil-Links', v => v.every(url), v => v.split(/[\s,]+/).filter(Boolean));
console.log('\n  Google Search Console → Eigenschaft hinzufügen → „URL-Präfix“ → Bestätigung per „HTML-Tag“ → Code kopieren');
await ask('GOOGLE_VERIFY', '  Google-Bestätigungs-Code', v => /^[\w-]{20,80}$/.test(v), meta);
console.log('\n  Bing Webmaster Tools → Website hinzufügen → „HTML-Meta-Tag“ (oder einfach „Aus Google importieren“)');
await ask('BING_VERIFY', '  Bing-Bestätigungs-Code', v => /^[A-F0-9]{20,40}$/i.test(v), meta);
rl.close();
fs.writeFileSync(SAVE, JSON.stringify(prev, null, 2));
console.log('\n✔ Gespeichert. Beim nächsten Online-Stellen wird alles eingebaut.');
