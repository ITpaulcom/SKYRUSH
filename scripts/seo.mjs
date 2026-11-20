// Sichtbarkeit (SEO · GEO · AEO): baut aus www/ + site/ den Veröffentlichungs-Ordner .publish/
//   · Info-Seiten in 11 Sprachen (/de/, /en/, …) mit echtem Text, FAQ, Screenshots – lesbar für Google, Bing und KI-Suchen
//   · strukturierte Daten (schema.org: VideoGame, WebSite, Organization, FAQPage, BreadcrumbList)
//   · hreflang-Verknüpfung aller Sprachen, Startseite (/) als x-default
//   · sitemap.xml (mit Bildern), robots.txt (KI-Crawler ausdrücklich erlaubt), llms.txt + llms-full.txt
//   · Presse-Seite (/presse/) mit Fakten, Texten, Downloads und Einbau-Code für Verlinkungen
//   · IndexNow-Schlüssel (Bing, Yandex, Seznam, Naver werden nach jedem Deploy sofort benachrichtigt)
// Die Apps (Android/iOS) bekommen davon nichts – sie nutzen weiter nur www/.
// Aufruf: node scripts/seo.mjs --origin https://myskyrush.com   (sonst übernimmt npm run deploy das automatisch)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd(), SITE = path.join(ROOT, 'site');
export const LANGS = ['de', 'en', 'es', 'fr', 'it', 'pt', 'tr', 'pl', 'id', 'ja', 'ko'];
// Welten des Spiels (Farben wie im Spiel, Höhe in Metern) – Namen kommen aus den Spiel-Übersetzungen
const WORLDS = [['Stadt', 0, '#FF7EB3', '#FFA37A', '#FFD36E'], ['Wolken', 250, '#3DA9FF', '#7FD3FF', '#D6F4FF'], ['Gewitterfront', 550, '#141A30', '#36405E', '#66769A'],
  ['Polarlicht', 850, '#071A3A', '#0E3B5C', '#1F6D7A'], ['Weltall', 1200, '#06021A', '#1B0B4A', '#3A1470'], ['Mondbasis', 1650, '#03040F', '#11163A', '#2A3260'],
  ['Sternennebel', 2150, '#14012E', '#43105F', '#9A2A72'], ['Kristallgalaxie', 2700, '#020B26', '#0B2E5C', '#17708E'], ['Goldenes Himmelstor', -10000, '#3A1C6E', '#F29A6B', '#FFE7A3']];   // muss zu BIOMES in www/core.js passen
const HREF = { pt: 'pt-BR' };                       // hreflang-Code (Inhalte sind brasilianisches Portugiesisch)
const DIR_NAMES = { de: 'Deutsch', en: 'English', es: 'Español', fr: 'Français', it: 'Italiano', pt: 'Português', tr: 'Türkçe', pl: 'Polski', id: 'Bahasa Indonesia', ja: '日本語', ko: '한국어' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

function readCfg() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, '.skyrush.json'), 'utf8')); } catch { return {}; }
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
// Store-Beschreibung → HTML (Überschriften, Absätze, Listen)
function aboutHtml(text) {
  return text.split(/\n\s*\n/).map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    let html = '';
    if (lines.length > 1 && lines[0].length < 48 && !/[.!?。！？:：]$/.test(lines[0])) html += `<h3>${esc(lines.shift())}</h3>`;
    const items = lines.filter(l => l.startsWith('•')), rest = lines.filter(l => !l.startsWith('•'));
    if (rest.length) html += `<p>${esc(rest.join(' '))}</p>`;
    if (items.length) html += `<ul>${items.map(l => `<li>${esc(l.replace(/^•\s*/, ''))}</li>`).join('')}</ul>`;
    return html;
  }).join('\n');
}

export function build({ origin, out = path.join(ROOT, '.publish'), cfg = readCfg(), date = new Date() } = {}) {
  origin = String(origin || '').replace(/\/$/, '');
  if (!/^https?:\/\//.test(origin)) throw new Error('origin fehlt (z. B. https://myskyrush.com)');
  const host = origin.replace(/^https?:\/\//, '');
  const brandSite = /myskyrush/i.test(host);
  const play = cfg.PLAY_URL || '', ios = cfg.APPSTORE_URL || '', social = [].concat(cfg.SOCIAL || []).filter(u => /^https:\/\//.test(u));
  const publisher = { '@type': 'Organization', '@id': origin + '/#org', name: cfg.PUBLISHER || 'ITpaul', url: cfg.PUBLISHER_URL || 'https://itpaul.com', logo: origin + '/icons/icon-512.png' };
  const altNames = ['SkyRush', 'MySkyRush', 'My Sky Rush', 'Sky Rush Game', 'Sky Rush: Jump & Duel'];
  const store = JSON.parse(fs.readFileSync(path.join(SITE, 'content', '_store.json'), 'utf8'));
  const T = Object.fromEntries(LANGS.map(l => [l, JSON.parse(fs.readFileSync(path.join(SITE, 'content', l + '.json'), 'utf8'))]));
  const day = date.toISOString().slice(0, 10), year = date.getFullYear();
  const H = s => String(s).replaceAll('{{HOST}}', host);
  const sameAs = [play, ios, ...social].filter(Boolean);

  fs.rmSync(out, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'www'), out);
  fs.mkdirSync(path.join(out, 'site'), { recursive: true });
  for (const f of ['site.css', 'site.js', 'badge-de.svg', 'badge-en.svg']) if (fs.existsSync(path.join(SITE, f))) fs.copyFileSync(path.join(SITE, f), path.join(out, 'site', f));
  copyDir(path.join(SITE, 'img'), path.join(out, 'site', 'img'));

  const hreflang = () => LANGS.map(l => `<link rel="alternate" hreflang="${HREF[l] || l}" href="${origin}/${l}/">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${origin}/">`;
  const game = (l, t) => ({
    '@type': 'VideoGame', '@id': origin + '/#game', name: 'Sky Rush', alternateName: altNames, url: origin + '/',
    description: t.desc, image: `${origin}/site/img/og-${l}.jpg`, screenshot: [1, 2, 3, 4].map(i => `${origin}/site/img/${l}/${i}.webp`),
    genre: ['Arcade', 'Jump and Run', 'Platformer', 'Endless Runner', 'Casual'], gamePlatform: ['Web browser', 'Android', 'iOS'],
    applicationCategory: 'GameApplication', operatingSystem: 'Web, Android, iOS', playMode: ['SinglePlayer', 'MultiPlayer'],
    numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 4 }, inLanguage: LANGS.map(x => HREF[x] || x),
    isAccessibleForFree: true, offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: origin + '/' },
    author: { '@id': origin + '/#org' }, publisher: { '@id': origin + '/#org' }, ...(sameAs.length ? { sameAs } : {}),
  });
  const website = { '@type': 'WebSite', '@id': origin + '/#website', name: 'Sky Rush', alternateName: altNames, url: origin + '/', inLanguage: LANGS.map(x => HREF[x] || x), publisher: { '@id': origin + '/#org' } };
  const faqOf = t => { const f = t.faq.map(([q, a], i) => [q, i === 1 && (play || ios) ? a + ' ' + t.faq_apps : a]); if (brandSite) f.push(t.faq_brand); return f.map(([q, a]) => [H(q), H(a)]); };
  const storeBtns = t => (play || ios) ? `<div class="stores"><span>${esc(t.stores_h)}</span>${play ? `<a class="btn sm" href="${esc(play)}" rel="noopener">▶ Google Play</a>` : ''}${ios ? `<a class="btn sm" href="${esc(ios)}" rel="noopener"> App Store</a>` : ''}</div>` : '';
  const urls = [];
  const gameT = l => { try { return l === 'de' ? {} : JSON.parse(fs.readFileSync(path.join(ROOT, 'www', 'lang', l + '.json'), 'utf8')); } catch { return {}; } };
  const worldsHtml = (l, t) => { const g = gameT(l), nf = new Intl.NumberFormat(HREF[l] || l);
    return WORLDS.map(([n, m, a, b, c]) => `<div class="w" style="--a:${a};--b:${b};--c:${c}"><b>${esc(g[n] || n)}</b><span>${esc((m < 0 ? t.every_m : t.from_m).replace('{}', nf.format(Math.abs(m))))}</span></div>`).join(''); };

  // ---------- Info-Seiten je Sprache ----------
  for (const l of LANGS) {
    const t = T[l], url = `${origin}/${l}/`, faq = faqOf(t), playUrl = `/?lang=${l}`;
    urls.push(url);
    const ld = { '@context': 'https://schema.org', '@graph': [publisher, website, game(l, t),
      { '@type': 'WebPage', '@id': url, url, name: t.title, description: t.desc, inLanguage: HREF[l] || l, isPartOf: { '@id': origin + '/#website' }, about: { '@id': origin + '/#game' }, primaryImageOfPage: `${origin}/site/img/og-${l}.jpg`, dateModified: day },
      { '@type': 'FAQPage', '@id': url + '#faq', inLanguage: HREF[l] || l, mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Sky Rush', item: origin + '/' }, { '@type': 'ListItem', position: 2, name: DIR_NAMES[l], item: url }] }] };
    const html = `<!doctype html>
<html lang="${HREF[l] || l}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.desc)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${url}">
${hreflang()}
<meta name="theme-color" content="#2A1B5C">
<meta name="google-adsense-account" content="ca-pub-1764627877115679">
<link rel="icon" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Sky Rush">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${origin}/site/img/og-${l}.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Sky Rush – ${esc(t.h1)}">
<meta property="og:locale" content="${t.locale}">
${LANGS.filter(x => x !== l).map(x => `<meta property="og:locale:alternate" content="${T[x].locale}">`).join('')}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(t.title)}">
<meta name="twitter:description" content="${esc(t.desc)}">
<meta name="twitter:image" content="${origin}/site/img/og-${l}.jpg">
<link rel="preload" href="/fonts/space-grotesk-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site/site.css">
${jsonld(ld)}
</head>
<body>
<header class="top"><a class="brand" href="/${l}/"><img src="/icons/icon-192.png" width="36" height="36" alt="">Sky Rush</a><nav><a class="lang" href="#langs" aria-label="${esc(t.langs_h)}">🌐 ${l.toUpperCase()}</a><a class="btn sm go" href="${playUrl}">${esc(t.play_short)}</a></nav></header>
<main>
<section class="hero">
  <div class="sky" aria-hidden="true"><i class="cl c1"></i><i class="cl c2"></i><i class="cl c3"></i><i class="pl p1"></i><i class="pl p2"></i><i class="pl p3"></i><i class="cn n1"></i><i class="cn n2"></i></div>
  <div class="hero-text">
    <p class="kicker">${esc(t.kicker)}</p>
    <h1 class="logo"><span>Sky</span> <span>Rush</span></h1>
    <p class="tagline">${esc(t.h1)}</p>
    <p class="lead">${esc(t.lead)}</p>
    <div class="ctas"><a class="btn go big" href="${playUrl}">▶ ${esc(t.play)}</a><a class="btn duel" href="${playUrl}#duel">${t.modes[3][0]} ${esc(t.modes[3][1])}</a></div>
    <ul class="pills">${t.play_note.split(' · ').map(x => `<li>✓ ${esc(x)}</li>`).join('')}</ul>
    <p class="live-top" data-top hidden>🏆 <b></b> <span></span></p>
    ${storeBtns(t)}
  </div>
  <div class="phone" data-hop data-demo="${playUrl}" role="button" tabindex="0" aria-label="${esc(t.demo_play)}">
    <div class="screen"><img src="/site/img/${l}/3.webp" width="432" height="768" alt="${esc(t.shots_alt[2])}" fetchpriority="high">${[1, 2, 4].map((i, k) => `<img class="sl s${k + 1}" src="/site/img/${l}/${i}.webp" width="432" height="768" alt="" loading="lazy" decoding="async">`).join('')}</div>
    <span class="demo-btn">▶ ${esc(t.demo_play)}</span>
    <a class="demo-full" href="${playUrl}">⛶ ${esc(t.demo_full)}</a>
  </div>
</section>
<div class="duo"><section class="card what" data-hop data-coin><h2>${esc(t.what_h)}</h2><p>${esc(t.what)}</p></section>
<section class="card lb" data-lb hidden data-hop data-coin><h2>🏆 ${esc(t.lb_h)}</h2><ol></ol><a class="btn go" href="${playUrl}">▶ ${esc(t.lb_cta)}</a></section></div>
<section id="worlds"><h2>${esc(t.worlds_h)}</h2><div class="worlds" data-hop data-coin>${worldsHtml(l, t)}</div></section>
<section><h2>${esc(t.feat_h)}</h2><div class="grid feats">${t.feats.map(([i, h, d]) => `<article class="tile" data-hop data-coin><span class="ico" aria-hidden="true">${i}</span><h3>${esc(h)}</h3><p>${esc(d)}</p></article>`).join('')}</div></section>
<section id="modes"><h2>${esc(t.modes_h)}</h2><div class="grid modes">${t.modes.map(([i, h, d], k) => `<article class="tile mode m${k}" data-hop data-coin><span class="ico" aria-hidden="true">${i}</span><h3>${esc(h)}</h3><p>${esc(d)}</p></article>`).join('')}</div></section>
<section><h2>${esc(t.shots_h)}</h2><div class="shots" data-hop>${[1, 2, 3, 4].map(i => `<img src="/site/img/${l}/${i}.webp" width="432" height="768" loading="lazy" alt="${esc(t.shots_alt[i - 1])}">`).join('')}</div></section>
<section><h2>${esc(t.how_h)}</h2><ol class="steps">${t.how.map(([h, d]) => `<li data-hop data-coin><h3>${esc(h)}</h3><p>${esc(d)}</p></li>`).join('')}</ol>
  ${t.keys_h ? `<div class="keys" data-hop><b>⌨️ ${esc(t.keys_h)}</b><span><kbd>←</kbd><kbd>→</kbd> ${esc(t.key_lr)}</span><span><kbd>↑</kbd> / <kbd>Space</kbd> ${esc(t.key_up)}</span><span><kbd>↓</kbd> ${esc(t.key_down)}</span><span><kbd>F</kbd> ${esc(t.key_f)}</span>${t.key_pad ? `<span class="pad">🎮 ${esc(t.key_pad)}</span>` : ''}</div>` : ''}</section>
<section class="card about" data-hop><h2>${esc(t.about_h)}</h2>${aboutHtml(store[l].about)}</section>
<section id="faq"><h2>${esc(t.faq_h)}</h2><div class="faq">${faq.map(([q, a], i) => `<details${i < 2 ? ' open' : ''} data-hop><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>
<section class="end" data-hop data-coin><h2>${esc(t.cta_h)}</h2><p>${esc(t.cta_t)}</p><a class="btn go big" href="${playUrl}">▶ ${esc(t.play)}</a></section>
</main>
<footer>
  <nav id="langs" aria-label="${esc(t.langs_h)}"><b>${esc(t.langs_h)}</b>${LANGS.map(x => `<a href="/${x}/" hreflang="${HREF[x] || x}" lang="${HREF[x] || x}"${x === l ? ' aria-current="page"' : ''}>${DIR_NAMES[x]}</a>`).join('')}</nav>
  <nav class="links"><a href="/">${esc(t.play_short)}</a><a href="/presse/">${esc(t.press)}</a><a href="/impressum.html">${esc(t.imprint)}</a><a href="/privacy.html">${esc(t.privacy)}</a></nav>
  <p>© ${year} Sky Rush · ${esc(t.made_by)} · <a href="${esc(publisher.url)}">${esc(publisher.url.replace(/^https?:\/\//, ''))}</a></p>
</footer>
<script type="application/json" id="site-i18n">${JSON.stringify({ play: t.play, hop_done_h: t.hop_done_h, hop_done_t: t.hop_done_t, hop_hide: t.hop_hide, hop_show: t.hop_show, hop_hint: t.hop_hint }).replace(/</g, '\\u003c')}</script>
<script src="/site/site.js" defer></script>
</body>
</html>
`;
    fs.mkdirSync(path.join(out, l), { recursive: true });
    fs.writeFileSync(path.join(out, l, 'index.html'), html);
  }

  // ---------- Startseite (das Spiel): Titel, Beschreibung, Vorschaubild, strukturierte Daten, hreflang ----------
  const en = T.en, idxPath = path.join(out, 'index.html');
  let idx = fs.readFileSync(idxPath, 'utf8');
  const headSeo = `<link rel="canonical" href="${origin}/">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
${hreflang()}
<meta property="og:type" content="website"><meta property="og:site_name" content="Sky Rush">
<meta property="og:title" content="${esc(en.title)}"><meta property="og:description" content="${esc(en.desc)}">
<meta property="og:url" content="${origin}/"><meta property="og:image" content="${origin}/site/img/og-en.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${origin}/site/img/og-en.jpg">
${cfg.GOOGLE_VERIFY ? `<meta name="google-site-verification" content="${esc(cfg.GOOGLE_VERIFY)}">` : ''}${cfg.BING_VERIFY ? `<meta name="msvalidate.01" content="${esc(cfg.BING_VERIFY)}">` : ''}
${jsonld({ '@context': 'https://schema.org', '@graph': [publisher, website, game('en', en)] })}`;
  idx = idx.replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, `<!--seo-->\n${headSeo}\n<!--/seo-->`);
  idx = idx.replace(/<title>[^<]*<\/title>/, `<title>${esc(en.title)}</title>`);
  idx = idx.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(en.desc)}">`);
  // Für Besucher ohne JavaScript (und Crawler): kurze Beschreibung + Links zu allen Sprachen
  const nos = `<noscript><div style="max-width:640px;margin:40px auto;padding:20px;font:16px/1.5 system-ui;color:#fff"><h1>Sky Rush</h1><p>${esc(en.what)}</p><p>${LANGS.map(x => `<a style="color:#FFC83D" href="/${x}/">${DIR_NAMES[x]}</a>`).join(' · ')}</p></div></noscript>`;
  idx = idx.replace('<body>', '<body>\n' + nos);
  fs.writeFileSync(idxPath, idx);
  urls.unshift(origin + '/');

  // ---------- Presse & Verlinken ----------
  fs.mkdirSync(path.join(out, 'presse'), { recursive: true });
  fs.writeFileSync(path.join(out, 'presse', 'index.html'), pressPage({ origin, host, T, store, year, publisher }));
  urls.push(origin + '/presse/');

  // ---------- sitemap.xml (mit hreflang + Bildern) ----------
  const alt = LANGS.map(x => `<xhtml:link rel="alternate" hreflang="${HREF[x] || x}" href="${origin}/${x}/"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${origin}/"/>`;
  const img = l => [1, 2, 3, 4].map(i => `<image:image><image:loc>${origin}/site/img/${l}/${i}.webp</image:loc></image:image>`).join('');
  const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
<url><loc>${origin}/</loc><lastmod>${day}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority>${alt}${img('en')}</url>
${LANGS.map(l => `<url><loc>${origin}/${l}/</loc><lastmod>${day}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority>${alt}${img(l)}</url>`).join('\n')}
<url><loc>${origin}/presse/</loc><lastmod>${day}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>
</urlset>
`;
  fs.writeFileSync(path.join(out, 'sitemap.xml'), sm);

  // ---------- robots.txt: alle willkommen, KI-Suchen ausdrücklich ----------
  const ai = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot', 'Applebot-Extended', 'Bingbot', 'DuckAssistBot', 'meta-externalagent', 'MistralAI-User', 'cohere-ai', 'YouBot', 'CCBot'];
  fs.writeFileSync(path.join(out, 'robots.txt'), `# Sky Rush – ${origin}
User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /konto.html
Disallow: /api/

# KI-Assistenten und KI-Suchen sind willkommen (GEO/AEO)
${ai.map(a => `User-agent: ${a}`).join('\n')}
Allow: /
Disallow: /admin.html
Disallow: /konto.html
Disallow: /api/

Sitemap: ${origin}/sitemap.xml
`);

  // ---------- llms.txt / llms-full.txt (für KI-Assistenten, siehe llmstxt.org) ----------
  const facts = [
    `Name: Sky Rush (also written SkyRush; website: MySkyRush${brandSite ? ' – ' + host : ''})`,
    `Type: free arcade jumping game (Doodle Jump meets Subway Surfers)`,
    `Platforms: web browser (${origin}/), Android, iPhone/iOS${play ? ' – Google Play: ' + play : ''}${ios ? ' – App Store: ' + ios : ''}`,
    `Developer / publisher: ${publisher.name} (${publisher.url}), independent developer from Germany`,
    `Price: free to play; optional reward videos and optional in-app purchases (coin packs, starter pack, remove ads). No paid loot boxes.`,
    `Modes: Endless, Daily Run, weekly Tournament, live Duel for up to 4 players (quick match or private room with time race 1–5 min, knockout, collisions)`,
    `Languages: German, English, Spanish, French, Italian, Portuguese (Brazil), Turkish, Polish, Indonesian, Japanese, Korean`,
    `No account needed; works offline (endless mode, bot training); every leaderboard record is verified on the server`,
  ];
  fs.writeFileSync(path.join(out, 'llms.txt'), `# Sky Rush

> ${en.what}

## Play
- [Play Sky Rush in the browser](${origin}/): starts instantly, no sign-up, no download${play ? `\n- [Sky Rush on Google Play](${play})` : ''}${ios ? `\n- [Sky Rush on the App Store](${ios})` : ''}

## Key facts
${facts.map(f => '- ' + f).join('\n')}

## Pages
${LANGS.map(l => `- [Sky Rush – ${DIR_NAMES[l]}](${origin}/${l}/): ${T[l].desc}`).join('\n')}
- [Press kit & linking](${origin}/presse/)

## FAQ
${faqOf(en).map(([q, a]) => `- **${q}** ${a}`).join('\n')}

## Optional
- [Full description](${origin}/llms-full.txt)
`);
  fs.writeFileSync(path.join(out, 'llms-full.txt'), `# Sky Rush – full description\n\n${facts.map(f => '- ' + f).join('\n')}\n\n## English\n\n${en.what}\n\n${store.en.about}\n\n## FAQ\n\n${faqOf(en).map(([q, a]) => `### ${q}\n${a}`).join('\n\n')}\n\n## Deutsch\n\n${T.de.what}\n\n${store.de.about}\n\n${faqOf(T.de).map(([q, a]) => `### ${q}\n${a}`).join('\n\n')}\n`);

  // ---------- IndexNow-Schlüssel + Kopfzeilen ----------
  let key = cfg.INDEXNOW_KEY;
  if (!/^[a-f0-9]{32}$/.test(key || '')) key = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(out, key + '.txt'), key);
  fs.writeFileSync(path.join(out, '_headers'), `/site/*
  Cache-Control: public, max-age=604800
/*.txt
  Content-Type: text/plain; charset=utf-8
/sitemap.xml
  Content-Type: application/xml; charset=utf-8
/admin.html
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
/konto.html
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
`);
  return { urls, key, host, pages: urls.length };
}

function pressPage({ origin, host, T, store, year, publisher }) {
  const de = T.de, en = T.en;
  const badge = (l, rel) => `<a href="${origin}/${l}/" title="${l === 'de' ? 'Sky Rush – das kostenlose Sprungspiel' : 'Sky Rush – the free sky jumping game'}"><img src="${rel ? '' : origin}/site/badge-${l}.svg" width="220" height="64" alt="${l === 'de' ? 'Sky Rush kostenlos spielen' : 'Play Sky Rush for free'}"></a>`;
  const textLink = l => `<a href="${origin}/${l}/">${l === 'de' ? 'Sky Rush – das kostenlose Sprungspiel' : 'Sky Rush – the free sky jumping game'}</a>`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sky Rush – Presse, Fakten & Verlinken · Press kit</title>
<meta name="description" content="Pressematerial zu Sky Rush: Fakten, Beschreibungen, Logo, Screenshots und Einbau-Code für Verlinkungen. Press kit for Sky Rush: facts, descriptions, logo, screenshots and link badges.">
<link rel="canonical" href="${origin}/presse/">
<link rel="icon" href="/icons/icon-192.png">
<meta property="og:title" content="Sky Rush – Presse & Verlinken"><meta property="og:image" content="${origin}/site/img/og-de.jpg"><meta property="og:url" content="${origin}/presse/">
<link rel="stylesheet" href="/site/site.css">
${jsonld({ '@context': 'https://schema.org', '@type': 'WebPage', '@id': origin + '/presse/', name: 'Sky Rush – Presse & Verlinken', inLanguage: ['de', 'en'], about: { '@id': origin + '/#game' }, isPartOf: { '@id': origin + '/#website' }, publisher: { '@type': 'Organization', name: publisher.name, url: publisher.url } })}
</head>
<body>
<header class="top"><a class="brand" href="/de/"><img src="/icons/icon-192.png" width="36" height="36" alt="">Sky Rush</a><nav><a class="btn sm go" href="/">Spielen</a></nav></header>
<main>
<section class="hero slim"><div class="hero-text"><p class="kicker">Presse · Press kit</p><h1 class="logo"><span>Sky</span> <span>Rush</span></h1><p class="lead">Alles, um über Sky Rush zu berichten oder darauf zu verlinken. Everything you need to write about or link to Sky Rush.</p></div></section>
<section class="card"><h2>Fakten · Fact sheet</h2><dl class="facts">
<dt>Name</dt><dd>Sky Rush (SkyRush, MySkyRush)</dd>
<dt>Website</dt><dd><a href="${origin}/">${host}</a></dd>
<dt>Entwickler · Developer</dt><dd>${esc(publisher.name)} – <a href="${esc(publisher.url)}">${esc(publisher.url.replace(/^https?:\/\//, ''))}</a> (Deutschland · Germany)</dd>
<dt>Genre</dt><dd>Arcade · Jump &amp; Run · Endless Runner · Casual</dd>
<dt>Plattformen · Platforms</dt><dd>Browser, Android, iOS</dd>
<dt>Preis · Price</dt><dd>Kostenlos · Free (optionale In-App-Käufe · optional in-app purchases)</dd>
<dt>Spieler · Players</dt><dd>1 (Endlos, Tages-Run, Turnier) · 2–4 live (Duell)</dd>
<dt>Sprachen · Languages</dt><dd>11 – DE, EN, ES, FR, IT, PT-BR, TR, PL, ID, JA, KO</dd>
</dl></section>
<section class="card"><h2>Kurzbeschreibung · Short description</h2>
<p><b>DE:</b> ${esc(store.de.short)}</p><p><b>EN:</b> ${esc(store.en.short)}</p>
<h3>Mittel · Medium</h3><p><b>DE:</b> ${esc(de.what)}</p><p><b>EN:</b> ${esc(en.what)}</p></section>
<section class="card"><h2>Downloads</h2><div class="dl">
<a class="btn sm" href="/icons/icon-512.png" download>App-Icon (512 px)</a>
<a class="btn sm" href="/site/img/og-de.jpg" download>Vorschaubild DE (1200×630)</a>
<a class="btn sm" href="/site/img/og-en.jpg" download>Preview image EN (1200×630)</a>
${[1, 2, 3, 4].map(i => `<a class="btn sm" href="/site/img/de/${i}.webp" download>Screenshot DE ${i}</a>`).join('')}
${[1, 2, 3, 4].map(i => `<a class="btn sm" href="/site/img/en/${i}.webp" download>Screenshot EN ${i}</a>`).join('')}
</div></section>
<section class="card"><h2>Verlinken · Link to us</h2>
<p>Du möchtest Sky Rush auf deiner Seite empfehlen? Kopiere einfach einen der Codes. · Want to recommend Sky Rush on your site? Just copy one of the snippets.</p>
<div class="embed"><div class="prev">${badge('de', 1)}</div><textarea readonly rows="3">${esc(badge('de'))}</textarea></div>
<div class="embed"><div class="prev">${badge('en', 1)}</div><textarea readonly rows="3">${esc(badge('en'))}</textarea></div>
<h3>Text-Link</h3>
<div class="embed"><div class="prev">${textLink('de')}</div><textarea readonly rows="2">${esc(textLink('de'))}</textarea></div>
<div class="embed"><div class="prev">${textLink('en')}</div><textarea readonly rows="2">${esc(textLink('en'))}</textarea></div>
</section>
</main>
<footer><nav class="links"><a href="/de/">Deutsch</a><a href="/en/">English</a><a href="/impressum.html">Impressum</a><a href="/privacy.html">Datenschutz</a></nav><p>© ${year} Sky Rush · ${esc(publisher.name)}</p></footer>
<script>document.querySelectorAll('textarea').forEach(t => t.onclick = () => { t.select(); navigator.clipboard && navigator.clipboard.writeText(t.value); });</script>
</body>
</html>
`;
}

// IndexNow: Bing (→ auch Copilot/ChatGPT-Suche), Yandex, Seznam, Naver sofort über neue/aktualisierte Seiten informieren
export async function pingIndexNow({ host, key, urls }) {
  const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls }) });
  return r.status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const i = process.argv.indexOf('--origin'), cfg = readCfg();
  const origin = i > 0 ? process.argv[i + 1] : (cfg.DOMAIN ? 'https://' + String(cfg.DOMAIN).replace(/^https?:\/\//, '') : cfg.SITE);
  const r = build({ origin, cfg });
  console.log(`  ${r.pages} Seiten für ${r.host} gebaut → .publish/`);
}
