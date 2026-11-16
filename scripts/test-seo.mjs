// Prüft die Sichtbarkeits-Bausteine (Info-Seiten, hreflang, strukturierte Daten, Sitemap, robots, llms.txt, IndexNow)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { build, LANGS } from './seo.mjs';

let bad = 0, n = 0;
const t = (ok, msg) => { n++; if (!ok) { bad++; console.log('  ✖ ' + msg); } };
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'skyrush-seo-'));
const before = fs.readFileSync('www/index.html', 'utf8');
const r = build({ origin: 'https://myskyrush.com', out, cfg: { PLAY_URL: 'https://play.google.com/store/apps/details?id=com.itpaul.skyrush', SOCIAL: ['https://www.tiktok.com/@skyrush'], GOOGLE_VERIFY: 'abcDEF1234567890abcDEF1234' } });
t(fs.readFileSync('www/index.html', 'utf8') === before, 'www/index.html bleibt unverändert (nur .publish wird angepasst)');
t(r.pages === LANGS.length + 2, 'Seitenzahl ' + r.pages);
const ldOf = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
for (const l of LANGS) {
  const f = path.join(out, l, 'index.html');
  t(fs.existsSync(f), `Seite /${l}/ fehlt`);
  const h = fs.readFileSync(f, 'utf8');
  t(h.includes(`<link rel="canonical" href="https://myskyrush.com/${l}/">`), `/${l}/: canonical`);
  t((h.match(/rel="alternate" hreflang=/g) || []).length === LANGS.length + 1, `/${l}/: hreflang vollständig`);
  t(h.includes('hreflang="x-default" href="https://myskyrush.com/"'), `/${l}/: x-default`);
  t(!h.includes('{{HOST}}') && !h.includes('undefined'), `/${l}/: Platzhalter übrig`);
  let ld; try { ld = ldOf(h)[0]; } catch (e) { t(false, `/${l}/: JSON-LD ungültig ${e.message}`); continue; }
  const types = ld['@graph'].map(x => x['@type']);
  t(['VideoGame', 'WebSite', 'Organization', 'FAQPage', 'BreadcrumbList', 'WebPage'].every(x => types.includes(x)), `/${l}/: Typen ${types}`);
  const faq = ld['@graph'].find(x => x['@type'] === 'FAQPage');
  t(faq.mainEntity.length === 9 && faq.mainEntity.every(q => q.name && q.acceptedAnswer.text.length > 30), `/${l}/: FAQ ${faq.mainEntity.length}`);
  t(faq.mainEntity.some(q => q.acceptedAnswer.text.includes('myskyrush.com')), `/${l}/: Domain in den Antworten`);
  const game = ld['@graph'].find(x => x['@type'] === 'VideoGame');
  t(game.sameAs.includes('https://play.google.com/store/apps/details?id=com.itpaul.skyrush') && !('aggregateRating' in game), `/${l}/: sameAs, keine erfundenen Bewertungen`);
  t(h.includes('play.google.com'), `/${l}/: Store-Knopf`);
  for (const img of [`og-${l}.jpg`, `${l}/1.webp`, `${l}/4.webp`]) t(fs.existsSync(path.join(out, 'site', 'img', img)), `Bild ${img}`);
  t((h.match(/<h1/g) || []).length === 1, `/${l}/: genau eine H1`);
}
const idx = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
t(idx.includes('<link rel="canonical" href="https://myskyrush.com/">') && idx.includes('google-site-verification') && idx.includes('<noscript>'), 'Startseite: canonical, Google-Code, noscript');
t(/<title>Sky Rush – [^<]+<\/title>/.test(idx) && ldOf(idx)[0]['@graph'].some(x => x['@type'] === 'VideoGame'), 'Startseite: Titel + VideoGame');
const sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
t((sm.match(/<url>/g) || []).length === LANGS.length + 2 && sm.includes('<image:loc>'), 'Sitemap mit allen Seiten + Bildern');
const rb = fs.readFileSync(path.join(out, 'robots.txt'), 'utf8');
t(rb.includes('Sitemap: https://myskyrush.com/sitemap.xml') && rb.includes('GPTBot') && rb.includes('ClaudeBot') && rb.includes('PerplexityBot') && rb.includes('Disallow: /admin.html'), 'robots.txt');
const llms = fs.readFileSync(path.join(out, 'llms.txt'), 'utf8');
t(llms.startsWith('# Sky Rush') && llms.includes('https://myskyrush.com/de/') && llms.includes('MySkyRush'), 'llms.txt');
t(fs.readFileSync(path.join(out, r.key + '.txt'), 'utf8') === r.key && /^[a-f0-9]{32}$/.test(r.key), 'IndexNow-Schlüssel');
t(fs.existsSync(path.join(out, 'presse', 'index.html')) && fs.readFileSync(path.join(out, 'presse', 'index.html'), 'utf8').includes('badge-de.svg'), 'Presse-Seite mit Einbau-Code');
// ohne eigene Domain: keine MySkyRush-Frage, keine Store-Knöpfe
const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'skyrush-seo-'));
build({ origin: 'https://skyrush-ab12c.netlify.app', out: out2, cfg: {} });
const h2 = fs.readFileSync(path.join(out2, 'de', 'index.html'), 'utf8');
t(!h2.includes('Was ist MySkyRush?') && !h2.includes('play.google.com') && h2.includes('skyrush-ab12c.netlify.app'), 'ohne Domain/Store-Links sauber');
fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(out2, { recursive: true, force: true });
console.log(bad ? `Sichtbarkeit: ${bad} von ${n} FEHLER` : `Sichtbarkeit: alle ${n} Prüfungen ok`);
process.exit(bad ? 1 : 0);
