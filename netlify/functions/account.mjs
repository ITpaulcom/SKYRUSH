// /api/account – Spielstand mit einem Google-Konto sichern und auf anderen Geräten laden.
// Ablauf (gleich für Browser und Apps – Google erlaubt die Anmeldung nicht in eingebetteten App-Ansichten):
//   1) Gerät: start      → kurzlebiger Code; das Spiel öffnet /konto.html#<Code> im (System-)Browser
//   2) Seite: finish     → „Mit Google anmelden“; der Server prüft das Google-Token selbst und verbindet
//   3) Gerät: poll       → linked (gesichert) · switch (dieses Google-Konto hat schon einen Spielstand) · other · expired
//   4) Gerät: adopt      → nur nach Bestätigung im Spiel: dieses Gerät übernimmt den gespeicherten Spielstand
//   status · unlink      → Anzeige bzw. Verbindung trennen
// Gespeichert werden nur Googles Konto-Nummer (sub) und die E-Mail-Adresse – zum Wiederfinden und für Hilfe-Anfragen.
import { json, preflight, store, update, auth, sha256 } from '../lib/db.mjs';
import { googleClientId } from '../lib/appcfg.mjs';
import { verifyGoogle, maskEmail } from '../lib/google.mjs';
import { indexPut } from '../lib/admin.mjs';

const CODE_TTL = 15 * 60e3, CODE = /^[a-f0-9]{32}$/, MAX_DEVICES = 8;
const rand = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
export const acctKeys = { g: sub => `acct/g/${sub}`, u: uid => `acct/u/${uid}`, c: code => `acct/c/${code}`, rl: uid => `acct/rl/${uid}`, recent: 'acct/recent' };
let verifier = verifyGoogle;
export const __setVerifier = f => { verifier = f || verifyGoogle; };   // nur für Tests

async function summaryOf(uid) {
  const st = store(), [p, v] = await Promise.all([st.get(`players/${uid}`, { type: 'json' }), st.get(`vault/${uid}`, { type: 'json' })]);
  const s = (v && v.s) || {};
  return { name: (p && p.name) || '', best: s.bestH || 0, level: s.level || 1, coins: s.coins || 0, games: s.games || 0, chars: (s.owned || []).length };
}

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: 'json' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'json' }, 400);
  const st = store(), noStore = { 'Cache-Control': 'no-store' };
  const clientId = await googleClientId();

  // ---- Schritt 2: Anmeldung auf der Konto-Seite (ohne Geräte-Geheimnis, nur mit Code + Google-Token) ----
  if (b.action === 'finish') {
    if (!CODE.test(b.code || '')) return json({ error: 'code' }, 400);
    const c = await st.get(acctKeys.c(b.code), { type: 'json' });
    if (!c || c.exp < Date.now()) return json({ error: 'expired' }, 410);
    if (c.state !== 'open') return json({ ok: true, state: c.state, email: c.email || '' });
    let g; try { g = await verifier(b.credential, clientId); } catch (e) { return json({ error: 'google', why: e.message }, 401); }
    const [gl, ul] = await Promise.all([st.get(acctKeys.g(g.sub), { type: 'json' }), st.get(acctKeys.u(c.uid), { type: 'json' })]);
    let state;
    if (gl && gl.uid === c.uid) state = 'linked';
    else if (gl) state = 'switch';
    else if (ul && ul.sub !== g.sub) state = 'other';
    else {
      let taken = false;
      await update(acctKeys.g(g.sub), cur => { if (cur) { taken = cur.uid !== c.uid; return undefined; } return { uid: c.uid, email: g.email, at: Date.now() }; });
      if (taken) state = 'switch';
      else {
        await st.setJSON(acctKeys.u(c.uid), { sub: g.sub, email: g.email, at: Date.now() });
        await indexPut(c.uid, { g: g.email || 'Google' }).catch(() => {});
        state = 'linked';
      }
    }
    const target = state === 'switch' ? (await st.get(acctKeys.g(g.sub), { type: 'json' })).uid : null;
    await st.setJSON(acctKeys.c(b.code), { ...c, state, email: g.email, sub: g.sub, target, done: Date.now() });
    return json({ ok: true, state, email: g.email }, 200, noStore);
  }

  // ---- alles andere nur mit Geräte-Anmeldung ----
  const player = await auth(b.uid, b.secret);
  if (!player) return json({ error: 'auth' }, 401);
  const uid = b.uid;

  if (b.action === 'status') {
    const ul = await st.get(acctKeys.u(uid), { type: 'json' });
    return json({ enabled: !!clientId, linked: !!ul, email: ul ? maskEmail(ul.email) : '' }, 200, noStore);
  }
  if (b.action === 'start') {
    if (!clientId) return json({ error: 'off' }, 409);
    const hour = Math.floor(Date.now() / 3600e3); let n = 0;
    await update(acctKeys.rl(uid), cur => { n = cur && cur.h === hour ? cur.n + 1 : 1; return { h: hour, n }; });
    if (n > 15) return json({ error: 'rate' }, 429);
    const code = rand(16), src = ['android', 'ios', 'web'].includes(b.src) ? b.src : '';
    await st.setJSON(acctKeys.c(code), { uid, exp: Date.now() + CODE_TTL, state: 'open', at: Date.now(), src });
    // Für die Zentrale („Google-Login“): die letzten Anmeldeversuche, um zu sehen, an welchem Schritt es hängt
    await update(acctKeys.recent, cur => ({ list: [{ code, uid, at: Date.now(), src }, ...((cur && cur.list) || [])].slice(0, 60) })).catch(() => {});
    return json({ code, path: '/konto.html#' + code, ttl: CODE_TTL }, 200, noStore);
  }
  if (b.action === 'poll' || b.action === 'adopt') {
    if (!CODE.test(b.code || '')) return json({ error: 'code' }, 400);
    const c = await st.get(acctKeys.c(b.code), { type: 'json' });
    if (!c || c.uid !== uid) return json({ error: 'code' }, 404);
    if (c.state === 'open' && c.exp < Date.now()) return json({ state: 'expired' }, 200, noStore);
    if (b.action === 'poll') {
      if (c.state !== 'open' && !c.seen) await update(acctKeys.c(b.code), cur => (cur && cur.state !== 'open' && !cur.seen ? { ...cur, seen: Date.now() } : undefined)).catch(() => {});   // Gerät hat das Ergebnis abgeholt
      const out = { state: c.state, email: maskEmail(c.email) };
      if (c.state === 'switch') { out.saved = await summaryOf(c.target); out.here = await summaryOf(uid); }
      return json(out, 200, noStore);
    }
    // adopt: dieses Gerät bekommt Zugang zum gespeicherten Spielstand (eigenes Geheimnis pro Gerät)
    if (c.state !== 'switch' || !c.target) return json({ error: 'state' }, 409);
    if (c.done && Date.now() - c.done > CODE_TTL) return json({ state: 'expired' }, 200, noStore);
    const secret = rand(24), hash = await sha256(secret);
    const p = await update(`players/${c.target}`, cur => { if (!cur) return undefined; const hs = [...(cur.hashes || []), hash].slice(-MAX_DEVICES); return { ...cur, hashes: hs, updated: Date.now() }; });
    if (!p) return json({ error: 'gone' }, 404);
    await st.setJSON(acctKeys.c(b.code), { ...c, state: 'used', used: Date.now() });
    return json({ ok: true, uid: c.target, secret }, 200, noStore);
  }
  if (b.action === 'unlink') {
    const ul = await st.get(acctKeys.u(uid), { type: 'json' });
    if (ul) {
      const gl = await st.get(acctKeys.g(ul.sub), { type: 'json' });
      if (gl && gl.uid === uid) await st.delete(acctKeys.g(ul.sub));
      await st.delete(acctKeys.u(uid));
      await indexPut(uid, { g: '' }).catch(() => {});
    }
    return json({ ok: true }, 200, noStore);
  }
  return json({ error: 'action' }, 400);
};
export const config = { path: '/api/account' };
