// SKY RUSH – Einstellungen aus der Zentrale (Werbung, Werbe-Anbieter, Google-Anmeldung).
// Beim Start sofort die zuletzt bekannte Fassung anwenden (auch offline), im Hintergrund die neue holen und für den nächsten Start merken.
// Leere Felder in der Zentrale bedeuten: Wert aus config.js behalten.
import { CONFIG } from './config.js';
import { applyShop, customNames } from './shopcfg.js';
import { addWords } from './i18n.js';

const LS = 'skyrush.cfg.v1';
const str = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function applyRemote(c) {
  if (!c || typeof c !== 'object') return;
  const a = c.ads || {}, A = CONFIG.ads || (CONFIG.ads = {});
  A.providers = { admob: true, web: true, house: true, ...(A.providers || {}) };
  if (a.providers) for (const k of ['admob', 'web', 'house']) if (typeof a.providers[k] === 'boolean') A.providers[k] = a.providers[k];
  if (typeof a.testMode === 'boolean') A.testMode = a.testMode;
  for (const pf of ['android', 'ios']) if (a[pf]) for (const f of ['rewarded', 'interstitial']) { const v = str(a[pf][f]); if (v) (A[pf] || (A[pf] = {}))[f] = v; }
  if (str(a.webPublisherId)) A.webPublisherId = str(a.webPublisherId);
  if (Array.isArray(a.testDeviceIds) && a.testDeviceIds.length) A.testDeviceIds = a.testDeviceIds.filter(x => typeof x === 'string').slice(0, 10);
  if (a.interstitial) { A.interstitial = { ...(A.interstitial || {}) }; for (const k of ['graceGames', 'everyGames', 'minSeconds', 'maxPerDay']) if (n(a.interstitial[k]) !== null) A.interstitial[k] = a.interstitial[k]; }
  if (n(a.rewardedMaxPerDay) !== null) A.rewardedMaxPerDay = a.rewardedMaxPerDay;
  if (a.placements && typeof a.placements === 'object') A.placements = { ...a.placements };
  if (a.estimatedEcpm) { A.estimatedEcpm = { ...(A.estimatedEcpm || {}) }; for (const k of ['rewarded', 'interstitial']) if (n(a.estimatedEcpm[k]) !== null) A.estimatedEcpm[k] = a.estimatedEcpm[k]; }
  try { applyShop(c.shop); addWords(customNames()); } catch {}
  const g = c.google || {};
  CONFIG.google = { ...(CONFIG.google || {}), ...(str(g.clientId) ? { clientId: str(g.clientId) } : {}) };
}
// zuletzt bekannte Fassung (synchron, vor dem Start der Werbung)
export function loadCachedRemote() {
  CONFIG.ads.providers = { admob: true, web: true, house: true, ...(CONFIG.ads.providers || {}) };
  try { const c = JSON.parse(localStorage.getItem(LS) || 'null'); if (c) applyRemote(c); } catch {}
}
export async function refreshRemote(fetchCfg) {
  try {
    const c = await fetchCfg(); if (!c || typeof c !== 'object') return false;
    try { localStorage.setItem(LS, JSON.stringify(c)); } catch {}
    applyRemote(c); return true;
  } catch { return false; }
}
