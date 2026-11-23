// SKY DUELL – Werbung, In-App-Käufe und Umsatz-Tracking.
// Native (iOS/Android): AdMob über @capacitor-community/admob, Käufe über RevenueCat.
// Web: Google H5 Games Ads (adBreak). Ohne Konfiguration: Simulations-Modus für Tests.

import { PACKS } from './catalog.js';
import { CONFIG } from './config.js';
import { showHouseAd, closeHouseAd } from './houseads.js';
import { CHANNEL } from './channel.js';
import { PORTAL, initPortal, portalAd, portalReady, gameplay, loadingDone } from './portal.js';
// Echtgeld-Käufe nur im Standard-Vertriebsweg (Google Play / App Store); Galaxy Store und Web-Portale: nur Werbung
const IAP_CHANNEL = CHANNEL === 'store';

const cap = window.Capacitor;
const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
const platform = isNative ? cap.getPlatform() : 'web';
const plugin = name => (isNative ? (cap.Plugins?.[name] || cap.registerPlugin?.(name)) : null);
const AdMob = plugin('AdMob');
const Purchases = plugin('Purchases');

const LS = 'skyrush.monetize.v1';
const st = load();
function load() {
  try { return Object.assign(defaults(), JSON.parse(localStorage.getItem(LS) || '{}')); } catch { return defaults(); }
}
function defaults() {
  return { gamesFinished: 0, gamesSinceInter: 0, lastAdAt: 0, day: '', interToday: 0, rewardedToday: 0,
    noAds: false, revenue: { totalMicros: 0, byFormat: {}, byDay: {}, impressions: 0, currency: 'USD', estimated: 0 } };
}
function save() { try { localStorage.setItem(LS, JSON.stringify(st)); } catch {} }
function rollDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (st.day !== d) { st.day = d; st.interToday = 0; st.rewardedToday = 0; save(); }
}

const listeners = { revenue: [] };
// Niemals Werbung mitten im Lauf: das Spiel meldet, ob gerade gespielt wird. Wird ein Lauf gestartet, während eine Anzeige
// noch lädt, wird sie verworfen. Ausnahme ist nur „Zweite Chance“ – die läuft auf dem Ende-Bildschirm, nicht im Lauf.
let runCheck = () => false;
const inRun = () => { try { return !!runCheck(); } catch { return false; } };
const blocked = placement => placement !== 'rescue' && inRun();
// Solange eine Anzeige (oder die Lade-Animation) offen ist, darf kein Lauf starten
let busy = 0, busySince = 0;
const track = fn => async (...a) => { if (!busy) busySince = Date.now(); busy++; try { return await fn(...a); } finally { busy = Math.max(0, busy - 1); } };
// Werbe-Diagnose: warum kommt (keine) Anzeige? Wird einmal pro Start an den Server gemeldet → Zentrale „Werbung“
const diag = { platform, consent: '', canRequest: null, init: '', loads: 0, fails: 0, err: '', shown: 0, house: 0, web: '' };
const errText = e => { if (!e) return '?'; const c = e.code ?? e.errorCode; const m = e.message || e.errorMessage || e.error || ''; return String((c != null ? c + ' ' : '') + m).slice(0, 120) || 'unbekannt'; };
// Anbieter und Platzierungen lassen sich in der Zentrale abschalten (remote.js); ohne Eintrag ist alles an
const prov = k => (k === 'house' && PORTAL) ? false : ((CONFIG.ads && CONFIG.ads.providers) || {})[k] !== false;   // Portale: keine Eigenwerbung für andere Produkte
const placementOn = p => !p || ((CONFIG.ads && CONFIG.ads.placements) || {})[p] !== false;
export const Monetize = {
  platform, isNative, channel: CHANNEL, portal: PORTAL, iapChannel: IAP_CHANNEL,
  gameStart: () => gameplay(true), loadingDone,
  get noAds() { return st.noAds; },
  get revenue() { return st.revenue; },
  onRevenue(fn) { listeners.revenue.push(fn); },
  init, setUser, rewarded: track(rewarded), maybeInterstitial: track(maybeInterstitial), gameFinished, buyNoAds, buyCoins, restore, privacyOptions, onGrant, shopInfo, loadProducts,
  // Belohnungsvideo möglich? Berücksichtigt Tagesgrenze, in der Zentrale abgeschaltete Platzierungen und Anbieter
  canShowRewarded(placement) {
    rollDay();
    if (!placementOn(placement) || st.rewardedToday >= CONFIG.ads.rewardedMaxPerDay) return false;
    if (PORTAL) return portalReady();
    if (isNative) return prov('admob') || prov('house');
    return (prov('web') && !!(adBreak || CONFIG.ads.webPublisherId)) || prov('house');
  },
  hasPrivacyOptions: () => privacyRequired,
  refresh, diag,
  get busy() { return busy > 0 && Date.now() - busySince < 130000 && (!!document.querySelector('.hx-wrap, .mz-load') || isNative); },   // Sicherheitsnetz: nie dauerhaft blockieren
  // Ein Duell startet (lässt sich nicht verschieben): offene Eigenwerbung / Lade-Animation sofort schließen
  abortAds() { loader(false); closeHouseAd(); },
  setRunCheck(fn) { if (typeof fn === 'function') runCheck = fn; },
};

// ---------- Umsatz erfassen ----------
let placementNow = '';
function recordRevenue(format, valueMicros, currency, estimated) {
  const r = st.revenue, d = new Date().toISOString().slice(0, 10);
  r.totalMicros += valueMicros; r.impressions++;
  r.byFormat[format] = (r.byFormat[format] || 0) + valueMicros;
  r.byDay[d] = (r.byDay[d] || 0) + valueMicros;
  if (estimated) r.estimated += valueMicros;
  if (currency) r.currency = currency;
  // nur die letzten 60 Tage behalten
  const days = Object.keys(r.byDay).sort(); while (days.length > 60) delete r.byDay[days.shift()];
  save();
  listeners.revenue.forEach(fn => { try { fn({ format, valueMicros, currency: currency || 'USD', estimated, placement: placementNow || format }); } catch {} });
}
const estimate = format => Math.round((CONFIG.ads.estimatedEcpm[format] || 0) * 1000); // eCPM/1000 → micros pro Impression

// ---------- Initialisierung ----------
let ready = false, privacyRequired = false, adsAllowed = false;
const loaded = { rewarded: false, interstitial: false };
// Läuft gerade ein Ladeversuch? Ist der letzte gescheitert (kein Füllstand)? → dann nicht warten, sondern sofort Eigenwerbung
const loading = { rewarded: 0, interstitial: 0 }, failedAt = { rewarded: 0, interstitial: 0 };
let webMiss = 0;   // wie oft AdSense zuletzt nichts hatte → beim nächsten Mal kürzer warten
let pendingReward = null, pendingInter = null, rewardEarned = false;

async function init() {
  rollDay();
  try { await initIap(); } catch (e) { console.warn('IAP init', e); }
  if (PORTAL) { try { await initPortal(); } catch {} ready = true; return; }
  if (isNative && AdMob && prov('admob')) {
    try {
      const devs = CONFIG.ads.testDeviceIds || [];
      await AdMob.initialize({ initializeForTesting: CONFIG.ads.testMode || devs.length > 0, testingDevices: devs });
      let info = {};
      try { info = await AdMob.requestConsentInfo(); } catch (e) { diag.consent = 'Fehler: ' + errText(e); }   // ohne Antwort trotzdem weiter (sonst nie Werbung)
      privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
      let consent = info;
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') { try { consent = await AdMob.showConsentForm(); } catch (e) { diag.consent = 'Formular: ' + errText(e); } }
      adsAllowed = consent.canRequestAds !== false;
      diag.consent = diag.consent || String(consent.status || info.status || '?'); diag.canRequest = adsAllowed; diag.init = 'ok';
      if (platform === 'ios') {
        const t = await AdMob.trackingAuthorizationStatus();
        if (t.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      }
      bindNative();
      if (adsAllowed) { preload('rewarded'); if (!st.noAds) preload('interstitial'); }
    } catch (e) { console.warn('AdMob init', e); diag.init = 'Fehler: ' + errText(e); }
  } else if (!isNative && CONFIG.ads.webPublisherId && prov('web')) {
    initWeb();
  }
  ready = true;
}
// Neue Einstellungen aus der Zentrale: Web-Werbung ggf. nachträglich starten, Anzeigen mit neuen Blöcken vorladen
function refresh() {
  if (!ready || PORTAL) return;
  if (!isNative && !adBreak && CONFIG.ads.webPublisherId && prov('web')) initWeb();
  if (isNative && AdMob && adsAllowed && prov('admob')) { if (!loaded.rewarded) preload('rewarded'); if (!st.noAds && !loaded.interstitial) preload('interstitial'); }
}

function unitId(format) { return (CONFIG.ads[platform] || {})[format]; }
// Test-Anzeigen, solange testMode an ist oder noch Googles Beispiel-IDs eingetragen sind
// iOS: solange noch keine eigene iOS-App-ID eingetragen ist, passen App-ID und Anzeigenblöcke nicht zusammen → Test-Anzeigen
const iosIdMissing = () => platform === 'ios' && String(CONFIG.ads.iosAppId).startsWith('ca-app-pub-3940256099942544');
const testing = format => CONFIG.ads.testMode || iosIdMissing() || String(unitId(format)).startsWith('ca-app-pub-3940256099942544');

function bindNative() {
  AdMob.addListener('onRewardedVideoAdLoaded', () => { loaded.rewarded = true; loading.rewarded = 0; diag.loads++; });
  AdMob.addListener('onRewardedVideoAdFailedToLoad', e => { loaded.rewarded = false; loading.rewarded = 0; failedAt.rewarded = Date.now(); diag.fails++; diag.err = 'Video: ' + errText(e); setTimeout(() => preload('rewarded'), 15000); });
  AdMob.addListener('onRewardedVideoAdReward', () => { rewardEarned = true; });
  AdMob.addListener('onRewardedVideoAdImpression', d => recordRevenue('rewarded', d?.valueMicros ?? estimate('rewarded'), d?.currencyCode, d?.valueMicros == null));
  AdMob.addListener('onRewardedVideoAdDismissed', () => { finishReward(rewardEarned); });
  AdMob.addListener('onRewardedVideoAdFailedToShow', () => { finishReward(false); });

  AdMob.addListener('interstitialAdLoaded', () => { loaded.interstitial = true; loading.interstitial = 0; diag.loads++; });
  AdMob.addListener('interstitialAdFailedToLoad', e => { loaded.interstitial = false; loading.interstitial = 0; failedAt.interstitial = Date.now(); diag.fails++; diag.err = 'Pause: ' + errText(e); setTimeout(() => preload('interstitial'), 30000); });
  AdMob.addListener('interstitialAdImpression', d => recordRevenue('interstitial', d?.valueMicros ?? estimate('interstitial'), d?.currencyCode, d?.valueMicros == null));
  AdMob.addListener('interstitialAdDismissed', () => finishInter());
  AdMob.addListener('interstitialAdFailedToShow', () => finishInter());
}
async function preload(format) {
  if (!isNative || !adsAllowed || loaded[format]) return;
  if (loading[format] && Date.now() - loading[format] < 20000) return;   // lädt schon
  loading[format] = Date.now();
  try {
    if (format === 'rewarded') await AdMob.prepareRewardVideoAd({ adId: unitId('rewarded'), isTesting: testing('rewarded') });
    else await AdMob.prepareInterstitial({ adId: unitId('interstitial'), isTesting: testing('interstitial') });
  } catch (e) { loading[format] = 0; failedAt[format] = Date.now(); diag.fails++; diag.err = format + ': ' + errText(e); /* Listener plant erneuten Versuch */ }
}
function finishReward(ok) {
  loaded.rewarded = false;
  const p = pendingReward; pendingReward = null; rewardEarned = false;
  preload('rewarded');
  p && p(ok);
}
function finishInter() {
  loaded.interstitial = false;
  const p = pendingInter; pendingInter = null;
  if (!st.noAds) preload('interstitial');
  p && p();
}

// ---------- Web: H5 Games Ads ----------
let adBreak = null, webBlocked = false;
function initWeb() {
  if (webBlocked) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CONFIG.ads.webPublisherId}`;
  s.crossOrigin = 'anonymous';
  s.onerror = () => { adBreak = null; webBlocked = true; diag.web = 'Skript blockiert'; };   // z. B. Werbeblocker → sofort Eigenwerbung statt warten
  s.dataset.adClient = CONFIG.ads.webPublisherId;
  if (CONFIG.ads.testMode) s.dataset.adbreakTest = 'on';
  s.dataset.adFrequencyHint = CONFIG.ads.interstitial.minSeconds + 's';
  document.head.appendChild(s);
  window.adsbygoogle = window.adsbygoogle || [];
  adBreak = o => window.adsbygoogle.push(o);
  adBreak({ preloadAdBreaks: 'on', sound: 'on' }); // adConfig
}

// ---------- Lade-Anzeige: nie ein stiller Bildschirm, während auf eine Anzeige gewartet wird ----------
let loaderEl = null;
const T = s => (window.__tr ? window.__tr(s) : s);
function loader(on) {
  if (!on) { if (loaderEl) { const el = loaderEl; loaderEl = null; el.classList.add('out'); setTimeout(() => el.remove(), 160); } return; }
  if (loaderEl) return;
  if (!document.getElementById('mz-css')) {
    const c = document.createElement('style'); c.id = 'mz-css';
    c.textContent = `.mz-load{position:fixed;inset:0;z-index:61;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0c0720;color:#fff;text-align:center;padding:24px;animation:mzIn .12s ease-out both}
.mz-load.out{opacity:0;transition:opacity .15s}.mz-load b{font-size:18px}.mz-load small{opacity:.7;font-size:13px}
.mz-spin{width:54px;height:54px;border-radius:50%;border:6px solid rgba(255,255,255,.18);border-top-color:#FFC83D;animation:mzSp .8s linear infinite}
@keyframes mzSp{to{transform:rotate(360deg)}}@keyframes mzIn{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.mz-spin{animation-duration:2.4s}}`;
    document.head.appendChild(c);
  }
  loaderEl = document.createElement('div'); loaderEl.className = 'mz-load'; loaderEl.setAttribute('role', 'status');
  loaderEl.innerHTML = `<div class="mz-spin"></div><b>${T('Video wird geladen …')}</b><small>${T('Einen Moment – gleich geht’s los.')}</small>`;
  document.body.appendChild(loaderEl);
}
const WAIT_NATIVE = 3000, WAIT_WEB = 1500;   // so lange höchstens auf eine echte Anzeige warten, dann sofort Eigenwerbung

// ---------- Rewarded (immer freiwillig, klar beschriftet) ----------
// Liefert true, wenn die Belohnung vergeben werden soll.
async function rewarded(placement) {
  rollDay(); placementNow = placement;
  if (blocked(placement) || !Monetize.canShowRewarded(placement)) return false;
  const done = ok => { if (ok) { st.rewardedToday++; st.lastAdAt = Date.now(); save(); } return ok; };

  if (PORTAL) return done(await portalAd('rewarded'));
  // Echte Anzeige (AdMob / AdSense). Gibt es gerade keine (neue App noch nicht freigeschaltet, keine Einwilligung, kein Füllstand),
  // springt die Eigenwerbung ein – die Belohnung funktioniert also immer.
  if (isNative && AdMob && prov('admob') && adsAllowed) {
    if (!loaded.rewarded) {
      // Hatte AdMob gerade keine Anzeige (kein Füllstand), nicht warten → sofort Eigenwerbung; im Hintergrund neu laden.
      // Läuft dagegen gerade ein Ladeversuch (z. B. schlechter Empfang), kurz mit Lade-Animation warten.
      const recentFail = failedAt.rewarded && Date.now() - failedAt.rewarded < 60000 && !loading.rewarded;
      preload('rewarded');
      if (!recentFail) { loader(true); await waitFor(() => loaded.rewarded || (!loading.rewarded && failedAt.rewarded), WAIT_NATIVE); }
    }
    loader(false);
    if (blocked(placement)) return false;   // Lauf hat inzwischen begonnen → keine Anzeige
    if (loaded.rewarded) {
      let failed = false;
      const ok = await new Promise(res => { pendingReward = res; AdMob.showRewardVideoAd().catch(() => { failed = true; finishReward(false); }); setTimeout(() => { if (pendingReward === res) finishReward(rewardEarned); }, 120000); });
      if (ok || !failed) { if (ok) diag.shown++; return done(ok); }
    }
  }
  if (!isNative && adBreak && prov('web')) {
    let offered = false;
    loader(true);
    const ok = await new Promise(res => {
      let given = false, called = false;
      const end = v => { if (!called) { called = true; loader(false); res(v); } };
      adBreak({
        type: 'reward', name: placement,
        beforeReward: show => { if (called || blocked(placement)) return; offered = true; loader(false); show(); },
        adViewed: () => { given = true; },
        adDismissed: () => {},
        adBreakDone: info => { diag.web = (info && info.breakStatus) || ''; if (given) recordRevenue('rewarded', estimate('rewarded'), 'USD', true); end(given); },
      });
      setTimeout(() => { if (!offered) end(false); }, webMiss ? 400 : WAIT_WEB);   // keine Anzeige bereit → sofort weiter zur Eigenwerbung
      setTimeout(() => end(given), 120000);                         // Sicherheitsnetz
    });
    loader(false);
    webMiss = offered ? 0 : webMiss + 1;
    if (offered) { if (ok) diag.shown++; return done(ok); }
  }
  // Ohne (aktiven) Werbe-Partner: Eigenwerbung (FAX Messenger, ITpaul) statt leerer Test-Anzeige – kein Umsatz, wird nicht gezählt
  if (!prov('house') || blocked(placement)) return false;
  const ok = await houseAd({ seconds: 5, reward: true, placement });
  if (ok) diag.house++;
  return done(ok);
}

// ---------- Interstitial: nur an natürlichen Pausen, mit Obergrenzen ----------
function gameFinished() { gameplay(false); st.gamesFinished++; st.gamesSinceInter++; save(); }

async function maybeInterstitial(placement) {
  rollDay(); placementNow = placement;
  const c = CONFIG.ads.interstitial;
  if (st.noAds || !placementOn(placement) || inRun()) return false;
  if (st.gamesFinished < c.graceGames) return false;
  if (st.gamesSinceInter < c.everyGames) return false;
  if (Date.now() - st.lastAdAt < c.minSeconds * 1000) return false;
  if (st.interToday >= c.maxPerDay) return false;

  let shown = false;
  if (PORTAL) {
    shown = await portalAd('interstitial');
  } else if (isNative && AdMob && prov('admob')) {
    if (!adsAllowed || !loaded.interstitial) { preload('interstitial'); return false; }
    if (inRun()) return false;
    // Sicherheitsnetz: kommt das Schließen-Ereignis nie an, hängt das Spiel nicht fest
    await new Promise(res => { pendingInter = res; AdMob.showInterstitial().catch(() => finishInter()); setTimeout(() => { if (pendingInter === res) finishInter(); }, 45000); });
    shown = true;
  } else if (!isNative && adBreak && prov('web')) {
    shown = await new Promise(res => {
      let viewed = false, called = false;
      const end = v => { if (!called) { called = true; res(v); } };
      adBreak({ type: 'next', name: placement, beforeAd: () => { if (!called) viewed = true; },
        adBreakDone: info => { diag.web = (info && info.breakStatus) || ''; if (viewed) recordRevenue('interstitial', estimate('interstitial'), 'USD', true); end(viewed); } });
      setTimeout(() => { if (!viewed) end(false); }, WAIT_WEB);   // nichts bereit → nicht warten
      setTimeout(() => end(viewed), 60000);
    });
    // AdSense liefert (noch) nichts → wie bisher Eigenwerbung, damit die Pause nicht ganz ausfällt
    if (!shown && prov('house') && !inRun() && /notReady|noAdPreloaded|error|other|timeout/.test(diag.web || 'other')) shown = await houseAd({ seconds: 3, reward: false, placement });
  } else if (prov('house') && !(isNative && prov('admob')) && !inRun()) {
    shown = await houseAd({ seconds: 3, reward: false, placement });
  }
  if (shown) { st.gamesSinceInter = 0; st.interToday++; st.lastAdAt = Date.now(); save(); }
  return shown;
}

function waitFor(cond, ms) {
  return new Promise(res => { const t0 = Date.now(); const iv = setInterval(() => { if (cond() || Date.now() - t0 > ms) { clearInterval(iv); res(); } }, 150); });
}

// ---------- Eigenwerbung (Web, solange kein Werbe-Partner wie AdSense eingerichtet ist) → houseads.js ----------
const houseAd = o => showHouseAd({ ...o, st, save, site: (CONFIG.apiBase || location.origin).replace(/\/$/, ''), tr: s => (window.__tr ? window.__tr(s) : s) });

// ---------- In-App-Käufe (Google Play Billing + Apple StoreKit über RevenueCat) ----------
// Produkte werden in der Play Console / App Store Connect angelegt (gleiche IDs), in RevenueCat einem Angebot zugeordnet.
// Münzpakete sind Verbrauchsartikel: Gutschrift genau einmal pro Transaktion – auch wenn die App beim Kauf abstürzt,
// wird beim nächsten Start nachgeliefert (Abgleich über die Kaufhistorie).
const DEFAULT_PACKS = PACKS;   // Pakete stehen im gemeinsamen Katalog (auch der Server rechnet damit)
const packs = () => {
  const list = (CONFIG.iap && CONFIG.iap.packs) || DEFAULT_PACKS;
  // ältere Konfiguration mit nur einem Paket weiter unterstützen
  return list;
};
let iapReady = false, iapError = '', iapUser = null;
async function setUser(uid) {
  if (!uid || iapUser === uid) return; iapUser = uid;
  if (iapReady) try { await Purchases.logIn({ appUserID: uid }); } catch {}
}
const products = {};          // id → { priceString, title, product, pkg }
const grantListeners = [];
async function initIap() {
  if (!IAP_CHANNEL) { iapError = 'channel'; return; }
  if (!isNative || !Purchases) { iapError = 'web'; return; }
  const key = platform === 'ios' ? CONFIG.iap.iosKey : CONFIG.iap.androidKey;
  if (!key) { iapError = 'nokey'; return; }
  // Käufe laufen unter der Spieler-ID – so kann der Server jeden Kauf bei RevenueCat selbst nachprüfen
  await Purchases.configure({ apiKey: key, ...(iapUser ? { appUserID: iapUser } : {}) });
  iapReady = true;
  try { Purchases.addCustomerInfoUpdateListener(ci => applyCustomer(ci)); } catch {}
  const { customerInfo } = await Purchases.getCustomerInfo();
  applyCustomer(customerInfo);
  loadProducts();
}
async function loadProducts() {
  if (!iapReady) return;
  try {
    const off = await Purchases.getOfferings();
    for (const o of [off.current, ...Object.values(off.all || {})].filter(Boolean))
      for (const p of o.availablePackages || []) if (p.product) products[p.product.identifier] = { priceString: p.product.priceString, title: p.product.title, product: p.product, pkg: p };
  } catch {}
  const missing = [CONFIG.iap.productNoAds, ...packs().map(p => p.id)].filter(id => !products[id]);
  if (missing.length) try {
    const r = await Purchases.getProducts({ productIdentifiers: missing, type: 'NON_SUBSCRIPTION' });
    for (const p of r.products || []) products[p.identifier] = { priceString: p.priceString, title: p.title, product: p };
  } catch {}
}
function applyCustomer(ci) {
  const active = ci?.entitlements?.active || {};
  st.noAds = !!active[CONFIG.iap.entitlementNoAds] || (ci?.allPurchasedProductIdentifiers || []).includes(CONFIG.iap.productNoAds);
  // Nachliefern: jede Münz-Transaktion genau einmal gutschreiben
  st.granted = st.granted || [];
  // Umstellung: Käufe aus älteren Versionen wurden dort schon gutgeschrieben → nur merken, nicht doppelt geben
  const migrate = st.grantV !== 2; st.grantV = 2;
  for (const tx of ci?.nonSubscriptionTransactions || []) {
    const id = tx.transactionIdentifier || tx.revenueCatIdentifier, pk = packs().find(p => p.id === tx.productIdentifier);
    if (!id || !pk || st.granted.includes(id)) continue;
    st.granted.push(id); if (st.granted.length > 300) st.granted.shift();
    if (migrate) { if (pk.once) st.starterBought = true; continue; }
    if (pk.once) st.starterBought = true;
    grant(pk, id);
  }
  save();
}
function grant(pk, tx) { const g = { coins: pk.coins || 0, chest: pk.chest || null, headstarts: pk.headstarts || 0, id: pk.id, tx }; if (grantListeners.length) grantListeners.forEach(fn => { try { fn(g); } catch {} }); else (st.pendingGrants = st.pendingGrants || []).push(g); save(); }
function onGrant(fn) { grantListeners.push(fn); const p = st.pendingGrants || []; st.pendingGrants = []; save(); p.forEach(g => fn(g)); }
async function purchase(id) {
  if (!iapReady) return { ok: false, msg: iapError === 'web' ? 'Käufe gibt es in der App (Google Play / App Store).' : 'Shop wird gerade eingerichtet – bitte später erneut versuchen.' };
  if (!products[id]) await loadProducts();
  const pr = products[id];
  if (!pr) return { ok: false, msg: 'Dieses Angebot ist gerade nicht verfügbar.' };
  try {
    const r = pr.pkg ? await Purchases.purchasePackage({ aPackage: pr.pkg }) : await Purchases.purchaseStoreProduct({ product: pr.product });
    applyCustomer(r.customerInfo);   // schreibt Münzen über die Transaktion gut (genau einmal)
    return { ok: true };
  } catch (e) {
    if (e?.userCancelled || e?.code === '1' || /cancel/i.test(e?.message || '')) return { ok: false, msg: '' };
    if (/pending|deferred/i.test(e?.message || '')) return { ok: false, msg: 'Zahlung ausstehend – die Gutschrift kommt automatisch, sobald sie bestätigt ist.' };
    return { ok: false, msg: 'Kauf fehlgeschlagen. Es wurde nichts abgebucht.' };
  }
}
async function buyNoAds() { const r = await purchase(CONFIG.iap.productNoAds); return r.ok ? { ok: st.noAds, msg: st.noAds ? '' : 'Kauf wird bestätigt …' } : r; }
async function buyCoins(id) { return purchase(id || packs()[1].id); }
async function restore() {
  if (!iapReady) return { ok: false, msg: 'Käufe gibt es in der App (Google Play / App Store).' };
  try { const { customerInfo } = await Purchases.restorePurchases(); applyCustomer(customerInfo); return { ok: true }; }
  catch { return { ok: false, msg: 'Wiederherstellen fehlgeschlagen.' }; }
}
function shopInfo() { return ({ ready: iapReady, reason: iapError, packs: packs().filter(p => !p.hidden).map(p => ({ ...p, price: products[p.id]?.priceString || '', owned: p.once && st.starterBought })), noAds: { price: products[CONFIG.iap.productNoAds]?.priceString || '', owned: st.noAds } }); }
async function privacyOptions() {
  if (isNative && AdMob) { try { await AdMob.showPrivacyOptionsForm(); } catch {} }
}
