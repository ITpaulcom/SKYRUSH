// SKY RUSH – Shop-Einstellungen aus der Zentrale (Preise, Rabatte, ausgeblendete Artikel, Kaufpakete).
// Gemeinsam für Gerät und Server: beide wenden dieselben Werte auf den Katalog an, damit Käufe überall gleich gerechnet werden.
// Grundpreise aus catalog.js bleiben in `base` erhalten – „Standard“ in der Zentrale stellt sie wieder her.
import { CHARS, STYLE, PACKS } from './catalog.js';

export const MAX_PRICE = 1000000, MAX_SALE = 90;

// ---------- Eigene Artikel aus der Zentrale (Figuren, Streams, Sneaker) ----------
// Werden aus Bausteinen zusammengesetzt, die das Spiel schon zeichnen kann (Farben, Zubehör, Formen, Effekte) –
// deshalb gehen neue Artikel ohne App-Update. IDs beginnen mit „x“ und sind zufällig (nicht erratbar).
export const CUSTOM_ID = /^x[a-z0-9]{4,15}$/;
export const CUSTOM_KEY = /^(jet|trail|shoe|hat|land|face):x[a-z0-9]{4,15}$/;
export const CUSTOM_MAX = 200;
export const CUSTOM_OPTS = {
  cats: { char: 'Figur', trail: 'Stream', shoe: 'Sneaker' },
  acc: { none: 'Ohne', ears: 'Ohren', antenna: 'Antenne', leaf: 'Blatt', crown: 'Krone', penguin: 'Pinguin-Bauch', flame: 'Flamme', ninja: 'Ninja-Band', alien: 'Fühler', panda: 'Panda-Flecken', unicorn: 'Einhorn' },
  sh: { circle: 'Punkte', sq: 'Quadrate', ring: 'Ringe', heart: 'Herzen', star: 'Sterne', mix: 'Sterne + Punkte', note: 'Noten', coin: 'Münzen', rainbow: 'Regenbogen (bunt wechselnd)' },
  shoe: { high: 'High-Top (hoher Schaft)', cloud: 'Wolkensohle', glow: 'Leuchten', shine: 'Glanz', flame: 'Flammen', stars: 'Sternchen' },
  rar: { c: 'Gewöhnlich', r: 'Selten', e: 'Episch', l: 'Legendär' },
};
const HEX = /^#[0-9A-Fa-f]{6}$/;
const txt = (v, n) => String(v ?? '').replace(/[<>"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
// Prüft einen eigenen Artikel und bringt ihn in die gespeicherte Form (oder null, wenn er ungültig ist)
export function cleanCustom(it) {
  if (!it || typeof it !== 'object') return null;
  const cat = String(it.cat || ''), id = String(it.id || '');
  if (!CUSTOM_OPTS.cats[cat] || !CUSTOM_ID.test(id)) return null;
  const name = txt(it.name, 28); if (name.length < 2) return null;
  const price = Math.floor(Number(it.price)); if (!(price >= 10 && price <= MAX_PRICE)) return null;
  const out = { id, cat, name, price: Math.round(price / 10) * 10 };
  const en = txt(it.nameEn, 28); if (en.length >= 2) out.nameEn = en;
  if (it.at && Number.isFinite(+it.at)) out.at = Math.floor(+it.at);
  if (cat === 'char') {
    const body = Array.isArray(it.body) ? it.body.filter(c => HEX.test(c)) : [];
    if (body.length !== 2) return null;
    out.body = body; out.acc = CUSTOM_OPTS.acc[it.acc] ? it.acc : 'none';
  } else {
    out.rar = CUSTOM_OPTS.rar[it.rar] ? it.rar : 'c';
    if (cat === 'trail') {
      out.sh = CUSTOM_OPTS.sh[it.sh] ? it.sh : 'circle';
      const cols = Array.isArray(it.cols) ? it.cols.filter(c => HEX.test(c)).slice(0, 4) : [];
      if (out.sh !== 'rainbow' && !cols.length) return null;
      out.cols = cols.length ? cols : ['#FFFFFF'];
    } else {
      for (const k of ['up', 'sole', 'acc']) { if (!HEX.test(it[k] || '')) return null; out[k] = it[k]; }
      out.fx = (Array.isArray(it.fx) ? it.fx : []).filter(f => CUSTOM_OPTS.shoe[f]).slice(0, 6);
    }
  }
  return out;
}
let added = [];
// Eigene Artikel in den Katalog einsetzen (vorher eingesetzte werden zuerst entfernt → beliebig oft aufrufbar)
export function applyCustom(list) {
  for (const [cat, k] of added) { if (cat === 'char') delete CHARS[k]; else delete STYLE[cat].items[k]; }
  added = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list.slice(0, CUSTOM_MAX) : []) {
    const c = cleanCustom(raw); if (!c || seen.has(c.id)) continue; seen.add(c.id);
    if (c.cat === 'char') {
      if (CHARS[c.id]) continue;
      CHARS[c.id] = { name: c.name, price: c.price, body: c.body, acc: c.acc, custom: true, ...(c.nameEn ? { nameEn: c.nameEn } : {}) };
    } else {
      const items = STYLE[c.cat].items; if (items[c.id]) continue;
      const base = { name: c.name, price: c.price, rar: c.rar, custom: true, ...(c.nameEn ? { nameEn: c.nameEn } : {}) };
      if (c.cat === 'trail') items[c.id] = c.sh === 'rainbow' ? { ...base, rainbow: true, cols: c.cols } : { ...base, cols: c.cols, ...(c.sh !== 'circle' ? { sh: c.sh } : {}) };
      else items[c.id] = { ...base, up: c.up, sole: c.sole, acc: c.acc, ...Object.fromEntries(c.fx.map(f => [f, true])) };
    }
    added.push([c.cat, c.id]);
  }
  // Höhen-Figuren bleiben im Shop ganz hinten
  if (added.some(a => a[0] === 'char')) for (const [k, v] of Object.entries(CHARS)) if (v.unlock) { delete CHARS[k]; CHARS[k] = v; }
  return added.length;
}
export const customNames = () => added.map(([cat, k]) => cat === 'char' ? CHARS[k] : STYLE[cat].items[k]).filter(x => x && x.nameEn).map(x => [x.name, x.nameEn]);
const round10 = n => Math.max(10, Math.round(n / 10) * 10);

// Alle Artikel, die man mit Münzen kaufen kann (Saison-, Turnier- und Höhen-Belohnungen sind ausgenommen)
export function shopItems() {
  const out = [];
  for (const [k, c] of Object.entries(CHARS)) if (!c.unlock && (c.base ?? c.price) > 0) out.push({ id: 'char:' + k, cat: 'char', k, name: c.name, base: c.base ?? c.price, ref: c });
  for (const [cat, cc] of Object.entries(STYLE)) for (const [k, it] of Object.entries(cc.items)) if (!it.season && (it.base ?? it.price) > 0) out.push({ id: cat + ':' + k, cat, k, name: it.name, base: it.base ?? it.price, rar: it.rar, ref: it });
  return out;
}
export const SHOP_IDS = () => new Set(shopItems().map(x => x.id));

// Ist ein Rabattzeitraum gerade aktiv? (ohne Enddatum = bis auf Weiteres)
export const saleActive = (s, now = Date.now()) => !!(s && s.pct > 0 && (!s.from || now >= s.from) && (!s.until || now < s.until));

// Wendet die Einstellungen an (mehrfach aufrufbar – jedes Mal von den Grundpreisen aus)
export function applyShop(shop, now = Date.now()) {
  const sh = shop && typeof shop === 'object' ? shop : {};
  applyCustom(sh.custom);
  const items = sh.items || {}, g = saleActive(sh.sale, now) ? sh.sale.pct : 0;
  for (const x of shopItems()) {
    const o = items[x.id] || {}, it = x.ref;
    if (it.base === undefined) it.base = it.price;
    const price = Number.isInteger(o.price) && o.price > 0 ? o.price : it.base;
    const pct = Number.isInteger(o.sale) && o.sale > 0 ? o.sale : g;
    it.price = pct > 0 ? round10(price * (1 - pct / 100)) : price;
    it.was = it.price < price ? price : 0;          // durchgestrichener Preis im Shop
    it.salePct = it.was ? pct : 0;
    it.hidden = o.hidden === true;
    it.isNew = o.isNew === true;
  }
  const packs = sh.packs || {};
  for (const p of PACKS) {
    if (p.baseTag === undefined) { p.baseTag = p.tag || ''; p.baseHidden = !!p.hidden; }
    const o = packs[p.id] || {};
    p.hidden = typeof o.hidden === 'boolean' ? o.hidden : p.baseHidden;
    p.tag = typeof o.tag === 'string' && o.tag.trim() ? o.tag.trim() : p.baseTag;
  }
  return { sale: g };
}
