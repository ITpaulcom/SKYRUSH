// Einstellungen aus der Zentrale (Werbung, Werbe-Anbieter, Google-Anmeldung).
// Liegen auf dem Server (Blob „cfg/app“) und überschreiben beim Spielstart die Werte aus config.js – ohne neues App-Update.
// Alles wird streng geprüft: falsche oder gefährliche Werte (z. B. Werbung öfter als die Richtlinien erlauben) kommen gar nicht erst an.
import { store } from './db.mjs';
import { shopItems, applyShop, applyCustom, cleanCustom, CUSTOM_MAX, MAX_PRICE, MAX_SALE } from '../../www/shopcfg.js';
import { PACKS } from '../../www/catalog.js';

export const CFG_KEY = 'cfg/app';
export const PLACEMENTS = ['rescue', 'double_coins', 'tournament_attempt', 'free_coins', 'streak_double', 'chest_double', 'wheel_spin', 'headstart', 'between_games'];
const AD_UNIT = /^ca-app-pub-\d{16}\/\d{10}$/, PUB = /^ca-pub-\d{16}$/, DEV = /^[A-Za-z0-9-]{8,64}$/;
const CLIENT = /^\d{6,20}-[a-z0-9]{10,64}\.apps\.googleusercontent\.com$/;
const int = (v, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined; };
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : undefined; };
const bool = v => (typeof v === 'boolean' ? v : undefined);
const prune = o => { for (const k of Object.keys(o)) { if (o[k] === undefined) delete o[k]; else if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) { prune(o[k]); if (!Object.keys(o[k]).length) delete o[k]; } } return o; };

// Eingabe aus der Zentrale → nur gültige Felder. Leere Zeichenkette = Wert aus config.js verwenden.
export function sanitize(c = {}) {
  const a = c.ads || {}, errors = [];
  const unit = (v, label) => { if (v === undefined || v === null) return undefined; const s = String(v).trim(); if (!s) return ''; if (AD_UNIT.test(s)) return s; errors.push(label); return undefined; };
  const out = {
    ads: {
      providers: a.providers ? { admob: bool(a.providers.admob), web: bool(a.providers.web), house: bool(a.providers.house) } : undefined,
      testMode: bool(a.testMode),
      android: a.android ? { rewarded: unit(a.android.rewarded, 'Android Belohnung'), interstitial: unit(a.android.interstitial, 'Android Werbepause') } : undefined,
      ios: a.ios ? { rewarded: unit(a.ios.rewarded, 'iOS Belohnung'), interstitial: unit(a.ios.interstitial, 'iOS Werbepause') } : undefined,
      webPublisherId: a.webPublisherId === undefined ? undefined : (() => { const s = String(a.webPublisherId || '').trim(); if (!s || PUB.test(s)) return s; errors.push('Web Publisher-ID'); return undefined; })(),
      testDeviceIds: Array.isArray(a.testDeviceIds) ? a.testDeviceIds.map(x => String(x).trim()).filter(x => DEV.test(x)).slice(0, 10) : undefined,
      // Faire Taktung: Untergrenzen sind fest – die Zentrale kann Werbung seltener, aber nie aufdringlicher machen
      interstitial: a.interstitial ? { graceGames: int(a.interstitial.graceGames, 2, 30), everyGames: int(a.interstitial.everyGames, 1, 20), minSeconds: int(a.interstitial.minSeconds, 90, 3600), maxPerDay: int(a.interstitial.maxPerDay, 0, 20) } : undefined,
      rewardedMaxPerDay: int(a.rewardedMaxPerDay, 0, 60),
      placements: a.placements && typeof a.placements === 'object' ? Object.fromEntries(PLACEMENTS.map(p => [p, bool(a.placements[p])])) : undefined,
      estimatedEcpm: a.estimatedEcpm ? { rewarded: num(a.estimatedEcpm.rewarded, 0, 100), interstitial: num(a.estimatedEcpm.interstitial, 0, 100) } : undefined,
    },
    shop: c.shop ? sanitizeShop(c.shop, errors) : undefined,
    google: c.google ? { clientId: (() => { const s = String(c.google.clientId || '').trim(); if (!s || CLIENT.test(s)) return s; errors.push('Google Client-ID'); return undefined; })() } : undefined,
  };
  return { cfg: prune(out), errors };
}

// Shop: nur bekannte Artikel, Preise 10 … 1.000.000 Münzen, Rabatt 1–90 %, Zeitraum als Zeitstempel
const TS = v => { const n = Number(v); return Number.isFinite(n) && n > 1.6e12 && n < 4.1e12 ? Math.floor(n) : undefined; };
function sanitizeShop(sh, errors) {
  // eigene Artikel zuerst prüfen und einsetzen – dann kennen Preise/Rabatte/Ausblenden auch sie
  const custom = [], ids = new Set();
  for (const raw of Array.isArray(sh.custom) ? sh.custom : []) { const c = cleanCustom(raw); if (!c) { errors.push('Artikel ' + String((raw && raw.name) || '?').slice(0, 20)); continue; } if (!ids.has(c.id) && custom.length < CUSTOM_MAX) { ids.add(c.id); custom.push(c); } }
  applyCustom(custom);
  const known = new Map(shopItems().map(x => [x.id, x])), items = {};
  for (const [id, o] of Object.entries(sh.items || {})) {
    if (!known.has(id) || !o || typeof o !== 'object') continue;
    const e = {};
    if (o.price !== undefined && o.price !== '' && o.price !== null) { const v = int(o.price, 10, MAX_PRICE); if (v === undefined) errors.push('Preis ' + id); else if (v !== known.get(id).base) e.price = v; }
    if (o.sale !== undefined && o.sale !== '' && o.sale !== null) { const v = int(o.sale, 0, MAX_SALE); if (v === undefined) errors.push('Rabatt ' + id); else if (v > 0) e.sale = v; }
    if (o.hidden === true) e.hidden = true;
    if (o.isNew === true) e.isNew = true;
    if (Object.keys(e).length) items[id] = e;
  }
  let sale;
  if (sh.sale && typeof sh.sale === 'object') {
    const pct = int(sh.sale.pct, 0, MAX_SALE);
    if (pct === undefined) errors.push('Shop-Rabatt');
    else if (pct > 0) { sale = { pct, from: TS(sh.sale.from), until: TS(sh.sale.until) }; if (sale.from && sale.until && sale.until <= sale.from) errors.push('Rabatt-Zeitraum'); }
  }
  const packs = {};
  for (const p of PACKS) {
    const o = (sh.packs || {})[p.id]; if (!o || typeof o !== 'object' || p.baseHidden || (p.baseHidden === undefined && p.hidden)) continue;
    const e = {};
    if (o.hidden === true) e.hidden = true;
    if (typeof o.tag === 'string' && o.tag.trim()) e.tag = o.tag.trim().replace(/[<>]/g, '').slice(0, 24);
    if (Object.keys(e).length) packs[p.id] = e;
  }
  return { items: Object.keys(items).length ? items : undefined, sale, packs: Object.keys(packs).length ? packs : undefined, custom: custom.length ? custom : undefined };
}
// Shop-Einstellungen auf den Katalog des Servers anwenden (vor jeder Abrechnung von Käufen)
export async function applyShopCfg() { const c = await readCfg(); applyShop(c.shop); return c.shop || {}; }

let memo = null, memoAt = 0;
export async function readCfg(fresh = false) {
  if (!fresh && memo && Date.now() - memoAt < 30e3) return memo;
  const v = (await store().get(CFG_KEY, { type: 'json' })) || {};
  memo = v; memoAt = Date.now();
  return v;
}
export async function writeCfg(input, by = '') {
  const { cfg, errors } = sanitize(input);
  if (errors.length) return { errors };
  const next = { ...cfg, updated: Date.now(), by };
  await store().setJSON(CFG_KEY, next);
  memo = next; memoAt = Date.now();
  return { cfg: next };
}
// Für die App/Website: nur was das Spiel braucht (keine internen Felder)
export async function publicCfg() {
  const c = await readCfg();
  return { ads: c.ads || {}, shop: c.shop || {}, google: { clientId: (c.google && c.google.clientId) || process.env.GOOGLE_CLIENT_ID || '' }, v: c.updated || 0 };
}
export async function googleClientId() {
  const c = await readCfg();
  return (c.google && c.google.clientId) || process.env.GOOGLE_CLIENT_ID || '';
}
