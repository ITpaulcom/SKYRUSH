// npm run deploy – testet, legt beim ersten Mal die Netlify-Seite an, setzt den Admin-Schlüssel,
// trägt die Server-Adresse ins Spiel ein, veröffentlicht Web-Version + Server und aktualisiert die Apps.
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const NL = 'npx --yes netlify-cli@27';
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const out = cmd => execSync(cmd, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
const step = t => console.log(`\n▶ ${t}`);

step('Spielkern testen');
run('node scripts/test-core.mjs');
run('node scripts/test-iap.mjs');   // Käufe: Gutschrift genau einmal
const [nMaj, nMin] = process.versions.node.split('.').map(Number);
if (nMaj > 20 || (nMaj === 20 && nMin >= 6)) run('node --import ./scripts/mock/register.mjs scripts/test-duel.mjs');   // Duell-Server mit simulierten Spielern

step('Bei Netlify anmelden (beim ersten Mal öffnet sich der Browser)');
const status = spawnSync(`${NL} status`, { shell: true, encoding: 'utf8' });
if (/Not logged in/i.test(status.stdout + status.stderr)) run(`${NL} login`);

if (!fs.existsSync('.netlify/state.json')) {
  // Bereits eine Seite (z. B. per Drag & Drop angelegt)? Dann diese weiterverwenden – sonst neue anlegen.
  // Name kann vorab in .skyrush.json (SITE_NAME) stehen – dann läuft alles ohne Rückfrage.
  const saved = fs.existsSync('.skyrush.json') ? JSON.parse(fs.readFileSync('.skyrush.json', 'utf8')) : {};
  let existing = saved.SITE_NAME;
  if (existing === undefined) {
    const rl = (await import('node:readline/promises')).createInterface({ input: process.stdin, output: process.stdout });
    existing = await rl.question('\nHast du schon eine Netlify-Seite für Sky Rush? Dann ihren Namen eingeben (z. B. skyrush-ab12c aus skyrush-ab12c.netlify.app), sonst Enter: ');
    rl.close();
  }
  existing = String(existing || '').trim().replace(/^https?:\/\//, '').replace(/\.netlify\.app.*$/, '');
  if (existing) { step(`Mit „${existing}“ verbinden`); run(`${NL} link --name ${existing}`); }
  else {
    step('Netlify-Seite anlegen');
    const name = 'skyrush-' + Math.random().toString(36).slice(2, 7);
    run(`${NL} sites:create --name ${name}`);
    if (!fs.existsSync('.netlify/state.json')) run(`${NL} link --name ${name}`);
  }
}
const siteId = JSON.parse(fs.readFileSync('.netlify/state.json', 'utf8')).siteId;

step('Server-Adresse ermitteln');
const site = JSON.parse(out(`${NL} api getSite --data "{\\"site_id\\":\\"${siteId}\\"}"`));
// Eigene Domain (z. B. myskyrush.com) erst nutzen, wenn sie wirklich auf dieses Projekt zeigt – sonst bleibt alles auf *.netlify.app
const netUrl = site.name ? `https://${site.name}.netlify.app` : (site.ssl_url || site.url).replace(/\/$/, '');
const svPre = fs.existsSync('.skyrush.json') ? JSON.parse(fs.readFileSync('.skyrush.json', 'utf8')) : {};
const domain = String(svPre.DOMAIN || site.custom_domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
async function domainLive(d) {
  if (!d) return false;
  try { const r = await fetch(`https://${d}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }); const j = await r.json(); return r.ok && j.ok === true; } catch { return false; }
}
if (domain && process.platform === 'win32') { try { execSync('ipconfig /flushdns', { stdio: 'ignore' }); } catch {} }   // alte DNS-Antworten verwerfen
const live = await domainLive(domain);
if (domain) console.log(live ? `  ✔ ${domain} ist erreichbar – Spiel, Apps und Suchmaschinen nutzen ab jetzt diese Adresse` : `  … ${domain} zeigt noch nicht hierher (DNS/Zertifikat) – vorerst bleibt ${netUrl}`);
const url = live ? 'https://' + domain : netUrl;
let cfg = fs.readFileSync('www/config.js', 'utf8');
if (!cfg.includes(`apiBase: '${url}'`)) { cfg = cfg.replace(/apiBase: '[^']*'/, `apiBase: '${url}'`); fs.writeFileSync('www/config.js', cfg); console.log(`  apiBase = ${url}`); }

step('Admin-Schlüssel hinterlegen');
const env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const token = ((env.match(/ADMIN_TOKEN=(.*)/) || [])[1] || '').trim();
if (token) run(`${NL} env:set ADMIN_TOKEN ${token} --force`, { stdio: ['inherit', 'ignore', 'inherit'] });
else console.log('  (kein .env gefunden – erst `npm run setup` ausführen, dann ist /admin.html nutzbar)');
const rcSecret = (env.match(/REVENUECAT_SECRET=(sk_\S+)/) || [])[1];
if (rcSecret) run(`${NL} env:set REVENUECAT_SECRET ${rcSecret} --force`, { stdio: ['inherit', 'ignore', 'inherit'] });

step('Sichtbarkeit: Info-Seiten in 11 Sprachen, Sitemap, strukturierte Daten, llms.txt');
const seo = await import('./seo.mjs');
const sv = fs.existsSync('.skyrush.json') ? JSON.parse(fs.readFileSync('.skyrush.json', 'utf8')) : {};
const origin = url;
const built = seo.build({ origin, cfg: sv });
if (live) {
  // Alte Adresse: Info-Seiten, Sitemap & Co. dauerhaft (301) auf die Domain umleiten, damit Google nur noch eine Adresse kennt.
  // Das Spiel selbst (/, index.html, /api) bleibt dort erreichbar – alte Apps und Spielstände funktionieren weiter.
  const old = netUrl.replace(/\/$/, '');
  const paths = [...seo.LANGS.map(l => `/${l}/*`), '/presse/*', '/site/*', '/sitemap.xml', '/llms.txt', '/llms-full.txt', '/privacy.html', '/impressum.html'];
  const lines = paths.map(p => `${old}${p}  https://${domain}${p.replace('/*', '/:splat')}  301!`);
  fs.writeFileSync('.publish/_redirects', '# automatisch von deploy.mjs\n' + lines.join('\n') + '\n');
}
if (sv.INDEXNOW_KEY !== built.key) { sv.INDEXNOW_KEY = built.key; fs.writeFileSync('.skyrush.json', JSON.stringify(sv, null, 2)); }
console.log(`  ${built.pages} Seiten für ${built.host}${live ? '' : '   (Tipp: eigene Domain in Netlify verbinden → dann zählt die)'}`);

step('Veröffentlichen');
run(`${NL} deploy --prod --no-build --dir .publish --functions netlify/functions --message "Sky Rush ${new Date().toISOString().slice(0, 16)}"`);

step('Suchmaschinen benachrichtigen (IndexNow: Bing, Copilot, Yandex, Naver …)');
try { const st = await seo.pingIndexNow({ host: built.host, key: built.key, urls: built.urls }); console.log(st === 200 || st === 202 ? `  ✔ ${built.urls.length} Seiten gemeldet` : `  Antwort ${st} – nicht schlimm, die Sitemap wird trotzdem gefunden`); }
catch (e) { console.log('  IndexNow gerade nicht erreichbar (nicht schlimm):', e.message); }

if (fs.existsSync('android') || fs.existsSync('ios')) {
  step('Apps aktualisieren (Android/iOS)');
  run('node scripts/configure-native.mjs');
  run('npx cap sync', { stdio: ['inherit', 'ignore', 'inherit'] });
}

step('Server prüfen (Rangliste & Speicher)');
let healthy = false;
for (let i = 0; i < 6 && !healthy; i++) {
  try { const r = await fetch(url + '/api/health', { cache: 'no-store' }); const j = await r.json(); healthy = r.ok && j.ok; } catch {}
  if (!healthy) await new Promise(r => setTimeout(r, 3000));
}
console.log(healthy ? '  ✔ Server antwortet – Rangliste, Turnier und Werbe-Auswertung sind aktiv.' : '  ✖ Server antwortet noch nicht. In 1–2 Minuten erneut deployen oder im Netlify-Dashboard unter „Functions“ nachsehen.');
console.log(`
✅ Online!
   Spiel:          ${url}
   Zentrale:       ${url}/admin.html
   Datenschutz:    ${url}/privacy.html   ← diese Adresse in Google Play & App Store eintragen
   app-ads.txt:    ${url}/app-ads.txt
   Info-Seiten:    ${origin}/de/  ·  ${origin}/en/  ·  Presse: ${origin}/presse/
   Sitemap:        ${origin}/sitemap.xml   ← in der Google Search Console einreichen (siehe SICHTBARKEIT - Anleitung)
Apps bauen:  npm run android   bzw. iOS über Codemagic (siehe RELEASE.md)
`);
