// SKY DUELL – Web-Spieleportale (CrazyGames, Poki). Werbung läuft dort ausschließlich über das SDK des Portals.
// Außerhalb eines Portal-Builds ist alles hier wirkungslos.
import { CHANNEL } from './channel.js';

export const PORTAL = CHANNEL === 'crazygames' || CHANNEL === 'poki' ? CHANNEL : '';
const SRC = { crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js', poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js' };
let sdk = null, playing = false, inAd = false;

// Spiel stumm schalten, solange Werbung läuft (verlangen beide Portale)
const adState = on => { inAd = on; try { dispatchEvent(new CustomEvent('skyrush:ad', { detail: on })); } catch {} };

function load(src) {
  return new Promise(res => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s); });
}

export async function initPortal() {
  if (!PORTAL) return false;
  if (!(await load(SRC[PORTAL]))) return false;
  try {
    if (PORTAL === 'crazygames') { await window.CrazyGames.SDK.init(); sdk = window.CrazyGames.SDK; try { sdk.game.loadingStart(); } catch {} cgSync(); }
    else { await window.PokiSDK.init(); sdk = window.PokiSDK; }
  } catch { sdk = null; }
  return !!sdk;
}
// CrazyGames-Spielstand über das Data-Modul des SDK: Bei angemeldeten CrazyGames-Spielern wandert der Spielstand
// mit auf jedes Gerät. Gespeichert wird ein Paket aller skyrush*-Einträge aus localStorage (wie beim Domain-Umzug).
const CG_KEY = 'sr_bundle', CG_FLAG = 'sr_cg_restored';
const srKeys = () => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^skyrush/.test(k)) o[k] = localStorage.getItem(k); } } catch {} return o; };
const games = j => { try { const s = JSON.parse(j || 'null'); return s ? (s.games || 0) * 1 + (s.bestH || s.best || 0) / 1e6 : -1; } catch { return -1; } };
function cgSync() {
  const d = sdk && sdk.data; if (!d) return;
  // 1) Stand aus der CrazyGames-Cloud übernehmen, wenn er weiter ist als der auf diesem Gerät (einmal pro Sitzung neu laden)
  try {
    const raw = d.getItem(CG_KEY), cg = raw ? JSON.parse(raw) : null;
    if (cg && typeof cg === 'object' && !sessionStorage.getItem(CG_FLAG) &&
        games(cg['skyrush.save.v1']) > games(localStorage.getItem('skyrush.save.v1'))) {
      Object.keys(srKeys()).forEach(k => localStorage.removeItem(k));
      Object.keys(cg).forEach(k => { if (/^skyrush/.test(k) && typeof cg[k] === 'string') localStorage.setItem(k, cg[k]); });
      sessionStorage.setItem(CG_FLAG, '1');
      location.reload(); return;
    }
  } catch {}
  // 2) Jede Änderung am Spielstand gebündelt (spätestens nach 1,5 s) ins Data-Modul schreiben
  let t = 0;
  const flush = () => { clearTimeout(t); t = 0; try { d.setItem(CG_KEY, JSON.stringify(srKeys())); } catch {} };
  const soon = k => { if (/^skyrush/.test(String(k)) && !t) t = setTimeout(flush, 1500); };
  try {
    const P = Storage.prototype, set = P.setItem, rem = P.removeItem;
    P.setItem = function (k, v) { set.call(this, k, v); if (this === localStorage) soon(k); };
    P.removeItem = function (k) { rem.call(this, k); if (this === localStorage) soon(k); };
  } catch {}
  addEventListener('pagehide', flush);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  flush();
}

export function loadingDone() {
  if (!sdk) return;
  try { PORTAL === 'crazygames' ? sdk.game.loadingStop() : sdk.gameLoadingFinished(); } catch {}
}
export function gameplay(on) {
  if (!sdk || on === playing) return; playing = on;
  try { PORTAL === 'crazygames' ? (on ? sdk.game.gameplayStart() : sdk.game.gameplayStop()) : (on ? sdk.gameplayStart() : sdk.gameplayStop()); } catch {}
}
// Kommt kein Video (z. B. CrazyGames „Basic Launch“: dort liefert das Portal noch keine Werbung aus),
// werden Video-Knöpfe 3 Minuten lang ausgeblendet statt ins Leere zu führen
let noAdUntil = 0;
export const portalReady = () => !!sdk && Date.now() >= noAdUntil;

// type: 'rewarded' | 'interstitial' → true, wenn die Anzeige gezeigt (bzw. das Video bis zum Ende geschaut) wurde
export async function portalAd(type) {
  if (!sdk || inAd) return false;
  const wasPlaying = playing; gameplay(false);
  let ok = false;
  try {
    if (PORTAL === 'crazygames') {
      ok = await new Promise(res => {
        let started = false; const t = setTimeout(() => { if (!started) noAdUntil = Date.now() + 180000; res(false); }, 90000);
        sdk.ad.requestAd(type === 'rewarded' ? 'rewarded' : 'midgame', {
          adStarted: () => { started = true; adState(true); },
          adFinished: () => { clearTimeout(t); res(true); },
          adError: () => { clearTimeout(t); if (type === 'rewarded' && !started) noAdUntil = Date.now() + 180000; res(type === 'rewarded' ? false : started); },
        });
      });
    } else {
      adState(true);
      ok = type === 'rewarded' ? !!(await sdk.rewardedBreak(() => adState(true))) : (await sdk.commercialBreak(() => adState(true)), true);
    }
  } catch { ok = false; }
  adState(false);
  if (wasPlaying) gameplay(true);
  return ok;
}
