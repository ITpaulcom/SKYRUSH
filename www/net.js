// SKY DUELL – Online-Funktionen über die eigenen Netlify Functions (/api/…).
// Kein Konto nötig: Das Gerät erzeugt einmalig eine zufällige ID und ein Geheimnis.

import { CONFIG } from './config.js';

// Server-Adresse: 1) aus config.js (für die Apps), 2) sonst die eigene Netlify-Seite (Web-Version).
// Beim Start prüft /api/health, ob der Server wirklich antwortet – sonst läuft das Spiel offline weiter.
const cap = window.Capacitor, isApp = !!cap?.isNativePlatform?.();
const sameOrigin = !isApp && /^https?:$/.test(location.protocol) && !/^(localhost|127\.|\[::1\])/.test(location.hostname) ? location.origin : '';
let BASE = (CONFIG.apiBase || sameOrigin || '').replace(/\/$/, '');
let up = false, checked = null;
const LS = 'skyrush.device.v1';
export const online = () => up;
async function check() {
  const tryBase = async b => {
    if (!b) return false;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(b + '/api/health', { signal: ctl.signal, cache: 'no-store' }); clearTimeout(t);
      const j = await r.json().catch(() => ({}));
      return r.ok && j.ok === true;
    } catch { return false; }
  };
  if (await tryBase(BASE)) { up = true; return true; }
  if (sameOrigin && BASE !== sameOrigin && await tryBase(sameOrigin)) { BASE = sameOrigin; up = true; return true; }
  up = false; return false;
}

function rand(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); }
let dev = null;
try { dev = JSON.parse(localStorage.getItem(LS) || 'null'); } catch {}
if (!dev) {
  const h = rand(16);
  dev = { uid: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`, secret: rand(24) };
  try { localStorage.setItem(LS, JSON.stringify(dev)); } catch {}
}

// text/plain statt application/json: so gilt die Anfrage als „einfach“ und braucht keine CORS-Vorabanfrage –
// die scheitert bei Netlify, und dann wären Apps (andere Herkunft) komplett offline. Der Server liest den Text als JSON.
// Jede Anfrage hat eine Zeitgrenze – hängt das Netz, geht es mit dem nächsten Versuch weiter statt zu blockieren
async function call(path, body, ms = 8000) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms);
  const r = await fetch(BASE + path, { signal: ctl.signal, ...(body ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body) } : {}) }).finally(() => clearTimeout(tm));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'http ' + r.status);
  return j;
}

export const Net = {
  online,
  uid: () => dev.uid,
  ensure() { return (checked ||= check()); },   // einmalige Server-Prüfung, Ergebnis wird gemerkt
  status: () => ({ base: BASE, up }),
  hasServer: () => !!BASE,
  setName: (name, country) => call('/api/player', { uid: dev.uid, secret: dev.secret, name, country }),
  rid: () => rand(12),
  vault: body => call('/api/vault', { uid: dev.uid, secret: dev.secret, ...body }, 25000),
  run: (action, body = {}) => call('/api/run', { uid: dev.uid, secret: dev.secret, action, ...body }),
  submit: (ticket, moves, score) => call('/api/submit-score', { uid: dev.uid, secret: dev.secret, ticket, moves, score }, 20000),
  async top(mode, period) {
    await this.ensure(); const j = await call(`/api/leaderboard?mode=${mode}&period=${encodeURIComponent(period)}&uid=${dev.uid}`); this._me = j.me; return j.top; },
  async myRank() { return this._me; },
  duel: (action, body = {}, ms) => call('/api/duel', { uid: dev.uid, secret: dev.secret, action, ...body }, ms),
  // Google-Konto: Spielstand sichern / auf anderem Gerät laden
  account: (action, body = {}) => call('/api/account', { uid: dev.uid, secret: dev.secret, action, ...body }, 10000),
  base: () => BASE,
  // Gerät übernimmt einen gespeicherten Spielstand (neue Zugangsdaten vom Server) – danach lädt das Spiel neu
  adopt(uid, secret) {
    if (!/^[a-f0-9-]{36}$/.test(uid) || !/^[a-f0-9]{32,64}$/.test(secret)) return false;
    dev = { uid, secret };
    try { localStorage.setItem(LS, JSON.stringify(dev)); } catch { return false; }
    return true;
  },
  // Einstellungen aus der Zentrale (Werbung, Anbieter, Google-Anmeldung)
  async config() { if (!BASE) return null; return call('/api/config', null, 6000); },
  async adDiag(diag, extra = {}) {
    if (!online()) return;
    try { await call('/api/ad-event', { uid: dev.uid, secret: dev.secret, diag, ...extra }); } catch {}
  },
  async logAd(format, valueMicros, currency, estimated, placement) {
    if (!online()) return;
    try { await call('/api/ad-event', { uid: dev.uid, secret: dev.secret, format, micros: valueMicros, currency, estimated, placement }); } catch {}
  },
};
