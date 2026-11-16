// SKY RUSH – Web-Spieleportale (CrazyGames, Poki). Werbung läuft dort ausschließlich über das SDK des Portals.
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
    if (PORTAL === 'crazygames') { await window.CrazyGames.SDK.init(); sdk = window.CrazyGames.SDK; try { sdk.game.loadingStart(); } catch {} }
    else { await window.PokiSDK.init(); sdk = window.PokiSDK; }
  } catch { sdk = null; }
  return !!sdk;
}
export function loadingDone() {
  if (!sdk) return;
  try { PORTAL === 'crazygames' ? sdk.game.loadingStop() : sdk.gameLoadingFinished(); } catch {}
}
export function gameplay(on) {
  if (!sdk || on === playing) return; playing = on;
  try { PORTAL === 'crazygames' ? (on ? sdk.game.gameplayStart() : sdk.game.gameplayStop()) : (on ? sdk.gameplayStart() : sdk.gameplayStop()); } catch {}
}
export const portalReady = () => !!sdk;

// type: 'rewarded' | 'interstitial' → true, wenn die Anzeige gezeigt (bzw. das Video bis zum Ende geschaut) wurde
export async function portalAd(type) {
  if (!sdk || inAd) return false;
  const wasPlaying = playing; gameplay(false);
  let ok = false;
  try {
    if (PORTAL === 'crazygames') {
      ok = await new Promise(res => {
        let started = false; const t = setTimeout(() => res(false), 90000);
        sdk.ad.requestAd(type === 'rewarded' ? 'rewarded' : 'midgame', {
          adStarted: () => { started = true; adState(true); },
          adFinished: () => { clearTimeout(t); res(true); },
          adError: () => { clearTimeout(t); res(type === 'rewarded' ? false : started); },
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
