// Test: Einstellungen aus der Zentrale (Werbung/Anbieter/Google) und „Spielstand mit Google sichern“.
// Google-Tokens werden mit einem eigenen Test-Schlüssel signiert und echt geprüft (Signatur, Aussteller, Empfänger, Ablauf).
import account from '../netlify/functions/account.mjs';
import configFn from '../netlify/functions/config.mjs';
import vault from '../netlify/functions/vault.mjs';
import admin from '../netlify/functions/admin.mjs';
import { sanitize } from '../netlify/lib/appcfg.mjs';
import { verifyGoogle } from '../netlify/lib/google.mjs';
import { __data } from './mock/blobs.mjs';

let ok = 0, bad = 0;
const t = (c, m) => { if (c) ok++; else { bad++; console.log('✖', m); } };
let NOW = Date.now(); const realNow = Date.now; Date.now = () => NOW;
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const P = () => ({ uid: crypto.randomUUID(), secret: hex(20) });
const post = async (fn, path, body, hdr = {}) => { const r = await fn(new Request('http://x' + path, { method: 'POST', headers: hdr, body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; };
const A = (p, action, body = {}) => post(account, '/api/account', { ...p, action, ...body });
const V = (p, actions = []) => post(vault, '/api/vault', { ...p, actions });

// ---------- Test-Schlüssel wie bei Google (RS256, JWKS) ----------
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
const JWKS = { keys: [{ kty: 'RSA', n: pub.n, e: pub.e, alg: 'RS256', use: 'sig', kid: 'k1' }] };
let certCalls = 0;
globalThis.fetch = async url => { if (String(url).includes('googleapis.com/oauth2/v3/certs')) { certCalls++; return new Response(JSON.stringify(JWKS), { headers: { 'cache-control': 'public, max-age=20000' } }); } throw new Error('kein Netz im Test: ' + url); };
const b64u = buf => Buffer.from(buf).toString('base64url');
const CLIENT = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';
async function token(claims = {}, { key = kp.privateKey, kid = 'k1', alg = 'RS256' } = {}) {
  const h = b64u(JSON.stringify({ alg, kid, typ: 'JWT' })), now = Math.floor(realNow() / 1000);
  const p = b64u(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub: '1098765432101234567', email: 'lena@example.com', email_verified: true, iat: now, exp: now + 3600, ...claims }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(h + '.' + p));
  return h + '.' + p + '.' + b64u(sig);
}

// ---------- 1) Prüfung der Einstellungen ----------
let s = sanitize({ ads: { providers: { admob: false, web: true, house: 'ja' }, testMode: true, android: { rewarded: 'ca-app-pub-1764627877115679/6549984440', interstitial: 'kaputt' }, interstitial: { graceGames: 0, everyGames: 3, minSeconds: 30, maxPerDay: 99 }, rewardedMaxPerDay: 20, placements: { rescue: false, unbekannt: true }, webPublisherId: 'ca-pub-1234567890123456' }, google: { clientId: CLIENT } });
t(s.errors.length === 1 && s.errors[0] === 'Android Werbepause', 'ungültiger Anzeigenblock wird gemeldet: ' + s.errors);
t(s.cfg.ads.providers.admob === false && s.cfg.ads.providers.web === true && s.cfg.ads.providers.house === undefined, 'Anbieter: nur echte Ja/Nein-Werte');
t(s.cfg.ads.interstitial.everyGames === 3 && s.cfg.ads.interstitial.graceGames === undefined && s.cfg.ads.interstitial.minSeconds === undefined && s.cfg.ads.interstitial.maxPerDay === undefined, 'Taktung: Werte außerhalb der fairen Grenzen fallen weg');
t(s.cfg.ads.placements.rescue === false && !('unbekannt' in s.cfg.ads.placements), 'nur bekannte Platzierungen');
t(sanitize({ google: { clientId: 'evil.example.com' } }).errors[0] === 'Google Client-ID', 'falsche Client-ID abgelehnt');

// ---------- 2) Zentrale speichert, App liest ----------
process.env.ADMIN_TOKEN = 'adm-0123456789abcdefghijklmnop'; process.env.ADMIN_FAIL_DELAY = '0';
const adReq = async (body, hdr = {}, method = 'POST', qs = '') => { const q = await admin(new Request('http://x/api/admin' + qs, { method, headers: { 'x-forwarded-for': '10.9.9.9', ...hdr }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })); return { status: q.status, ...(await q.json()) }; };
const SESS = (await adReq({ action: 'login', key: process.env.ADMIN_TOKEN })).token;
const ad = body => adReq(body, { authorization: 'Bearer ' + SESS }), adGet = qs => adReq(null, { authorization: 'Bearer ' + SESS }, 'GET', qs);
let r = await post(configFn, '/api/config', null).catch(() => null);
r = await configFn(new Request('http://x/api/config')); let cj = await r.json();
t(r.status === 200 && cj.google.clientId === '' && cj.ads && /max-age/.test(r.headers.get('cache-control')), 'ohne Einstellungen: leere Vorgaben, kurz zwischengespeichert');
r = await ad({ action: 'config', cfg: { ads: { android: { rewarded: 'falsch' } } } });
t(r.status === 400 && r.fields.includes('Android Belohnung'), 'Zentrale: ungültige Eingabe wird abgelehnt');
r = await ad({ action: 'config', cfg: { ads: { providers: { admob: true, web: false, house: true }, placements: { between_games: false }, interstitial: { everyGames: 3 } }, google: { clientId: CLIENT } } });
t(r.ok, 'Zentrale: Einstellungen gespeichert');
NOW += 31e3;
cj = await (await configFn(new Request('http://x/api/config'))).json();
t(cj.google.clientId === CLIENT && cj.ads.providers.web === false && cj.ads.placements.between_games === false && cj.ads.interstitial.everyGames === 3, 'App bekommt die neuen Einstellungen');
r = await adGet('?view=config');
t(r.cfg.google.clientId === CLIENT && r.base && r.placements.length >= 9, 'Zentrale zeigt Einstellungen + Grundwerte');
t((await adGet('?view=log')).log.some(l => l.a === 'config' && /web=false/.test(l.d)), 'Änderung steht im Protokoll');
r = await post(admin, '/api/admin', { action: 'config', cfg: {} });
t(r.status === 401, 'Einstellungen nur mit Anmeldung');

// ---------- 3) Google-Token wird echt geprüft ----------
t((await verifyGoogle(await token(), CLIENT)).sub === '1098765432101234567', 'gültiges Token wird angenommen');
const rej = async (tok, why) => { try { await verifyGoogle(tok, CLIENT); return false; } catch (e) { return !why || e.message === why; } };
t(await rej(await token({ aud: 'anderer-client.apps.googleusercontent.com' }), 'aud'), 'fremde Client-ID abgelehnt');
t(await rej(await token({ iss: 'https://evil.example' }), 'iss'), 'falscher Aussteller abgelehnt');
t(await rej(await token({ exp: Math.floor(realNow() / 1000) - 600 }), 'exp'), 'abgelaufenes Token abgelehnt');
t(await rej(await token({}, { key: other.privateKey }), 'sig'), 'falsche Signatur abgelehnt');
t(await rej((await token()).replace(/\.[^.]+\./, '.' + b64u(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub: '1', exp: 9e9 })) + '.'), 'sig'), 'veränderter Inhalt abgelehnt');
t(await rej(await token({}, { alg: 'none' })), '„alg: none“ abgelehnt');
t(certCalls >= 1 && certCalls <= 3, 'Google-Schlüssel werden zwischengespeichert (' + certCalls + ')');

// ---------- 4) Gerät A sichert seinen Spielstand ----------
const D1 = P(); await V(D1);
r = await A(D1, 'status');
t(r.enabled && !r.linked, 'Status: Google-Anmeldung an, noch nicht verbunden');
r = await A(D1, 'start');
t(/^[a-f0-9]{32}$/.test(r.code) && r.path === '/konto.html#' + r.code, 'Start: Code + Seite');
const c1 = r.code;
r = await A(D1, 'poll', { code: c1 }); t(r.state === 'open', 'wartet auf Anmeldung');
r = await post(account, '/api/account', { action: 'finish', code: c1, credential: 'quatsch' });
t(r.status === 401, 'Konto-Seite: kaputtes Token abgelehnt');
r = await post(account, '/api/account', { action: 'finish', code: c1, credential: await token() });
t(r.ok && r.state === 'linked' && r.email === 'lena@example.com', 'Konto-Seite: verbunden');
r = await A(D1, 'poll', { code: c1 }); t(r.state === 'linked' && r.email === 'l•••@example.com', 'Gerät erfährt es (E-Mail gekürzt)');
r = await A(D1, 'status'); t(r.linked && r.email === 'l•••@example.com', 'Status: gesichert');
t(__data.get('acct/g/1098765432101234567').val.uid === D1.uid, 'Google-Konto zeigt auf den Spielstand');
r = await post(account, '/api/account', { action: 'finish', code: c1, credential: await token() });
t(r.ok && r.state === 'linked', 'zweimal absenden schadet nicht');
const P1 = (await adGet('?view=player&uid=' + D1.uid));
t(P1.google && P1.google.email === 'lena@example.com', 'Zentrale zeigt die Google-Verbindung');
t((await adGet('?view=players')).players.find(p => p.u === D1.uid).g === 'lena@example.com', 'Spielerliste: nach E-Mail suchbar');

// ---------- 5) Neues Gerät B: Spielstand laden ----------
const D2 = P(); await V(D2);
r = await A(D2, 'start'); const c2 = r.code;
r = await post(account, '/api/account', { action: 'finish', code: c2, credential: await token() });
t(r.state === 'switch', 'Konto hat schon einen Spielstand → Wechsel anbieten');
r = await A(D2, 'poll', { code: c2 });
t(r.state === 'switch' && r.saved && typeof r.saved.best === 'number' && r.here, 'Gerät sieht beide Spielstände zum Vergleich');
t((await A(D1, 'poll', { code: c2 })).error === 'code', 'fremder Code: kein Zugriff');
r = await A(D2, 'adopt', { code: c2 });
t(r.ok && r.uid === D1.uid && /^[a-f0-9]{48}$/.test(r.secret), 'Gerät B bekommt eigenen Zugang zum Spielstand');
const D2n = { uid: r.uid, secret: r.secret };
t((await V(D2n)).econ !== undefined, 'Gerät B spielt jetzt mit dem gesicherten Spielstand');
t((await V(D1)).econ !== undefined, 'Gerät A funktioniert weiter');
t((await A(D2, 'adopt', { code: c2 })).error === 'state', 'Code nur einmal verwendbar');
t((await V({ uid: D1.uid, secret: hex(24) })).status === 401, 'falsches Geheimnis weiterhin abgelehnt');
t((await adGet('?view=player&uid=' + D1.uid)).player.devices === 2, 'Zentrale: 2 Geräte');

// ---------- 6) Sonderfälle ----------
const D3 = P(); await V(D3);
r = await A(D3, 'start'); await post(account, '/api/account', { action: 'finish', code: r.code, credential: await token({ sub: '2222222222', email: 'tom@example.com' }) });
r = await A(D3, 'start');
r = await post(account, '/api/account', { action: 'finish', code: r.code, credential: await token({ sub: '3333333333', email: 'neu@example.com' }) });
t(r.state === 'other', 'Gerät schon mit anderem Google-Konto verbunden → nicht still umhängen');
r = await A(D3, 'start'); const c3 = r.code; NOW += 16 * 60e3;
t((await post(account, '/api/account', { action: 'finish', code: c3, credential: await token() })).status === 410, 'abgelaufener Code');
t((await A(D3, 'poll', { code: c3 })).state === 'expired', 'Gerät sieht „abgelaufen“');
let lim = 0; for (let i = 0; i < 20; i++) if ((await A(D3, 'start')).error === 'rate') lim++;
t(lim > 0, 'zu viele Starts werden gebremst');
r = await A(D3, 'unlink'); t(r.ok && !(await A(D3, 'status')).linked && !__data.get('acct/g/2222222222'), 'Spieler kann die Verbindung trennen');
r = await ad({ action: 'unlinkGoogle', uid: D1.uid, why: 'Test' });
t(r.ok && !(await A(D1, 'status')).linked, 'Zentrale kann die Verbindung trennen');
r = await ad({ action: 'config', cfg: { google: { clientId: '' } } }); NOW += 31e3;
t((await A(D1, 'start')).error === 'off', 'ohne Client-ID ist das Sichern aus');

console.log(bad ? `Konto & Einstellungen: ${bad} Fehler, ${ok} ok` : `Konto & Einstellungen: alle ${ok} Prüfungen ok`);
process.exit(bad ? 1 : 0);
