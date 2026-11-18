// SKY RUSH – Shop-Einstellungen aus der Zentrale (Preise, Rabatte, ausgeblendete Artikel, Kaufpakete).
// Gemeinsam für Gerät und Server: beide wenden dieselben Werte auf den Katalog an, damit Käufe überall gleich gerechnet werden.
// Grundpreise aus catalog.js bleiben in `base` erhalten – „Standard“ in der Zentrale stellt sie wieder her.
import { CHARS, STYLE, PACKS } from './catalog.js';

export const MAX_PRICE = 1000000, MAX_SALE = 90;
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
