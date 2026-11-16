// SKY RUSH – Zentrale (Server-Seite): Anmeldung mit Sperre, Sitzungen, Protokoll, Spielerverzeichnis, Änderungen am Spielstand.
//
// Sicherheit
// • Anmeldung nur mit dem Zentrale-Schlüssel (ADMIN_TOKEN, mind. 24 Zeichen). Danach gibt es eine Sitzung (8 Stunden),
//   der Schlüssel selbst bleibt nicht im Browser liegen.
// • 3 falsche Versuche → dieser Anschluss ist 1 Stunde gesperrt, beim nächsten Mal 24 Stunden.
//   10 falsche Versuche (egal von wo) innerhalb von 24 Stunden → Anmeldung für alle 1 Stunde gesperrt.
//   Ein neuer Schlüssel (SKY-RUSH-ZENTRALE-SCHLUESSEL.bat) hebt jede Sperre auf und meldet alle Sitzungen ab.
// • Jede Änderung landet im Protokoll (wer/was/wann, IP nur als Kürzel).
//
// Änderungen am Spielstand
// • Werden als Auftrag gespeichert (adm/q/<uid>) und sofort im Tresor ausgeführt. Läuft gleichzeitig ein Abgleich des Spielers
//   und überschreibt den Tresor, führt der nächste Abgleich den Auftrag nach (jeder Auftrag wirkt genau einmal).
import { timingSafeEqual } from 'node:crypto';
import * as E from '../../www/economy.js';
import * as M from '../../www/meta.js';
import { CHARS, STYLE } from '../../www/catalog.js';
import { MAX_LEVEL } from '../../www/core.js';
import { store, update, sha256 } from './db.mjs';

const H = 3600e3, DAY = 24 * H;
export const LOGIN = { tries: 3, lock1: H, lock2: DAY, globalTries: 10, globalLock: H, session: 8 * H };
const rid = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const keyOf = () => String(process.env.ADMIN_TOKEN || '');
const fp = async () => (await sha256('fp:' + keyOf())).slice(0, 12);
const ipOf = req => (req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unbekannt');
export const ipTag = async req => (await sha256('ip:' + ipOf(req))).slice(0, 10);

// ---------- Anmeldung ----------
export async function login(req, key) {
  const K = keyOf();
  if (K.length < 24) return { status: 503, error: 'nokey' };
  const now = Date.now(), f = await fp(), ip = await ipTag(req), lk = `adm/lock/${f}`;
  const st = (await store().get(lk, { type: 'json' })) || { ips: {}, g: { fails: [], until: 0 } };
  const rec = st.ips[ip] || { n: 0, lv: 0, until: 0 };
  if (st.g && st.g.until > now) return { status: 423, error: 'locked', until: st.g.until, all: true };
  if (rec.until > now) return { status: 423, error: 'locked', until: rec.until };
  const a = Buffer.from(await sha256('k:' + String(key || '')), 'hex'), b = Buffer.from(await sha256('k:' + K), 'hex');
  if (!timingSafeEqual(a, b)) {
    let out = null;
    await update(lk, cur => {
      const s = cur || { ips: {}, g: { fails: [], until: 0 } };
      s.g ??= { fails: [], until: 0 };
      const r = s.ips[ip] || { n: 0, lv: 0, until: 0 };
      r.n++; r.last = now;
      if (r.n >= LOGIN.tries) { r.lv++; r.until = now + (r.lv > 1 ? LOGIN.lock2 : LOGIN.lock1); r.n = 0; }
      s.ips[ip] = r;
      s.g.fails = [...(s.g.fails || []).filter(t => now - t < DAY), now];
      if (s.g.fails.length >= LOGIN.globalTries) { s.g.until = now + LOGIN.globalLock; s.g.fails = []; }
      // alte Einträge aufräumen
      for (const [k, v] of Object.entries(s.ips)) if (v.until < now - 7 * DAY && now - (v.last || 0) > 7 * DAY) delete s.ips[k];
      out = { left: r.until > now ? 0 : LOGIN.tries - r.n, until: r.until > now ? r.until : (s.g.until > now ? s.g.until : 0), all: s.g.until > now };
      return s;
    }).catch(() => {});
    await log(req, 'login-fail', null, out && out.until ? 'gesperrt bis ' + new Date(out.until).toISOString().slice(0, 16).replace('T', ' ') : `noch ${out ? out.left : '?'} Versuche`);
    await new Promise(r => setTimeout(r, Number(process.env.ADMIN_FAIL_DELAY ?? 600)));
    return out && out.until ? { status: 423, error: 'locked', until: out.until, all: out.all } : { status: 401, error: 'key', left: out ? out.left : 0 };
  }
  // richtig: Fehlversuche dieses Anschlusses vergessen, Sitzung anlegen
  if (st.ips[ip]) await update(lk, cur => { if (!cur || !cur.ips[ip]) return undefined; delete cur.ips[ip]; return cur; }).catch(() => {});
  const token = rid(32), exp = now + LOGIN.session;
  await store().setJSON(`adm/sess/${await sha256('s:' + token)}`, { fp: f, exp, ip, at: now, ua: String(req.headers.get('user-agent') || '').slice(0, 120) });
  await log(req, 'login', null, '');
  return { status: 200, token, exp };
}
// Sitzung prüfen → { ip, exp } oder null
export async function session(req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization') || '');
  if (!m || keyOf().length < 24) return null;
  const s = await store().get(`adm/sess/${await sha256('s:' + m[1])}`, { type: 'json' });
  if (!s || s.exp < Date.now() || s.fp !== (await fp())) return null;
  return s;
}
export async function logout(req, all = false) {
  const st = store();
  if (all) { const { blobs } = await st.list({ prefix: 'adm/sess/' }); await Promise.all(blobs.map(b => st.delete(b.key))); return blobs.length; }
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization') || '');
  if (m) await st.delete(`adm/sess/${await sha256('s:' + m[1])}`);
  return 1;
}
export async function securityInfo() {
  const st = store(), f = await fp(), now = Date.now();
  const lock = (await st.get(`adm/lock/${f}`, { type: 'json' })) || { ips: {}, g: { fails: [], until: 0 } };
  const { blobs } = await st.list({ prefix: 'adm/sess/' });
  const sess = (await Promise.all(blobs.map(b => st.get(b.key, { type: 'json' })))).filter(s => s && s.exp > now && s.fp === f).map(s => ({ at: s.at, exp: s.exp, ip: s.ip, ua: s.ua }));
  return {
    sessions: sess.sort((a, b) => b.at - a.at),
    locks: Object.entries(lock.ips || {}).filter(([, v]) => v.until > now || v.n).map(([ip, v]) => ({ ip, fails: v.n, until: v.until > now ? v.until : 0 })),
    global: { fails24h: (lock.g?.fails || []).filter(t => now - t < DAY).length, until: lock.g?.until > now ? lock.g.until : 0 },
    rules: LOGIN, keyLength: keyOf().length,
  };
}

// ---------- Protokoll ----------
export async function log(req, a, uid, d, name = '') {
  const ip = req ? await ipTag(req) : '';
  try {
    await update('adm/log', cur => { const l = (cur && cur.list) || []; l.unshift({ at: Date.now(), a, u: uid || '', n: name || '', d: String(d || '').slice(0, 300), ip }); if (l.length > 500) l.length = 500; return { list: l }; });
  } catch {}
}
export const readLog = async () => ((await store().get('adm/log', { type: 'json' })) || { list: [] }).list;

// ---------- Spielerverzeichnis (16 Teile, damit gleichzeitige Abgleiche sich nicht in die Quere kommen) ----------
const shard = uid => `idx/p${String(uid)[0] || '0'}`;
export const SHARDS = '0123456789abcdef'.split('').map(c => `idx/p${c}`);
export function summary(player, v) {
  const s = v && v.s ? v.s : {};
  const lv = s.levels || {}, tr = s.trophies || {};
  return {
    n: (player && player.name) || '', c: (player && player.country) || null, cr: (player && player.created) || (v && v.created) || 0,
    at: (v && v.at) || (player && player.updated) || 0, h: s.bestH || 0, co: s.coins || 0, l: s.level || 1, m: s.mult || 1,
    gl: Object.values(lv).reduce((a, x) => a + (x || 0), 0), t: [tr.g || 0, tr.s || 0, tr.b || 0], ch: (s.chests || []).length, ga: s.games || 0, v: v ? 1 : 0,
  };
}
export async function indexPut(uid, entry) {
  await update(shard(uid), cur => { const d = cur || {}; d[uid] = { ...(d[uid] || {}), ...entry }; return d; });
}
export async function readIndex() {
  const parts = await Promise.all(SHARDS.map(k => store().get(k, { type: 'json' }).catch(() => null)));
  const out = [];
  for (const p of parts) if (p) for (const [u, e] of Object.entries(p)) out.push({ u, ...e });
  return out;
}
// Verzeichnis aus allen Spielern aufbauen (in Portionen, falls es viele sind)
export async function reindex(offset = 0, n = 150) {
  const st = store(), { blobs } = await st.list({ prefix: 'players/' });
  const keys = blobs.map(b => b.key).sort(), part = keys.slice(offset, offset + n);
  const rows = await Promise.all(part.map(async k => { const uid = k.slice(8); const [p, v] = await Promise.all([st.get(k, { type: 'json' }), st.get(`vault/${uid}`, { type: 'json' })]); return [uid, summary(p, v)]; }));
  const byShard = {};
  for (const [uid, e] of rows) (byShard[shard(uid)] ||= {})[uid] = e;
  for (const [k, add] of Object.entries(byShard)) await update(k, cur => ({ ...(cur || {}), ...Object.fromEntries(Object.entries(add).map(([u, e]) => [u, { ...((cur || {})[u] || {}), ...e }])) }));
  return { done: Math.min(keys.length, offset + n), total: keys.length, next: offset + n < keys.length ? offset + n : null };
}

// ---------- Änderungen am Spielstand ----------
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
const POWERS = ['jet', 'magnet', 'shield', 'boots'];
const DEFAULT_STYLE = ['jet:classic', 'trail:fire', 'shoe:basic', 'hat:none', 'land:dust', 'face:happy'];
const bad = code => { const e = new Error(code); e.code = code; throw e; };
// Wendet einen Auftrag auf den Tresor an. Gibt eine kurze Beschreibung zurück (fürs Protokoll).
export function applyOp(v, op) {
  const s = E.ensure(v.s);
  switch (op.kind) {
    case 'coins': {
      const n = int(op.n, 0, 1e8), was = s.coins;
      s.coins = op.mode === 'set' ? n : op.mode === 'sub' ? Math.max(0, s.coins - n) : s.coins + n;
      return `Münzen ${was} → ${s.coins}`;
    }
    case 'levels': {
      const was = POWERS.map(k => s.levels[k]).join('.');
      for (const k of POWERS) if (op.lv && op.lv[k] !== undefined) s.levels[k] = int(op.lv[k], 0, MAX_LEVEL);
      return `Stufen ${was} → ${POWERS.map(k => s.levels[k]).join('.')}`;
    }
    case 'mult': { const was = s.mult; s.mult = int(op.n, 1, 30); if (s.mult !== was) s.missions = E.newMissions(s); return `Multiplikator ×${was} → ×${s.mult}`; }
    case 'tokens': { const was = s.tokens.headstart; s.tokens.headstart = int(op.n, 0, 999); return `Kopfstarts ${was} → ${s.tokens.headstart}`; }
    case 'level': { const was = s.level; s.level = int(op.n, 1, 999); s.xp = 0; return `Level ${was} → ${s.level}`; }
    case 'chestAdd': { if (!M.CHEST[op.type]) bad('type'); const n = int(op.n || 1, 1, 50); for (let i = 0; i < n; i++) s.chests.push(op.type); return `+${n} ${M.CHEST[op.type].name}`; }
    case 'chestDel': {
      if (op.all) { const n = s.chests.length; s.chests = []; return `alle ${n} Truhen entfernt`; }
      const i = op.type ? s.chests.indexOf(op.type) : int(op.i, 0, 999);
      if (i < 0 || i >= s.chests.length) bad('none');
      const [t] = s.chests.splice(i, 1); return `${M.CHEST[t].name} entfernt`;
    }
    case 'charAdd': { if (!CHARS[op.k]) bad('item'); if (!s.owned.includes(op.k)) s.owned.push(op.k); return `Figur ${CHARS[op.k].name} gegeben`; }
    case 'charDel': {
      if (!CHARS[op.k] || op.k === 'hops') bad('item');
      s.owned = s.owned.filter(k => k !== op.k);
      // Höhen-Figur weg → sonst käme sie beim nächsten Abgleich über den Rekord zurück
      if (CHARS[op.k].unlock && s.bestH >= CHARS[op.k].unlock) { s.bestH = CHARS[op.k].unlock - 1; s.milestone = Math.min(s.milestone, Math.floor(s.bestH / 1e4)); }
      return `Figur ${CHARS[op.k].name} entfernt`;
    }
    case 'styleAdd': { const it = E.styleItem(op.key); if (!it) bad('item'); if (!s.ownedStyle.includes(op.key)) s.ownedStyle.push(op.key); return `${it.it.name} gegeben`; }
    case 'styleDel': { const it = E.styleItem(op.key); if (!it || DEFAULT_STYLE.includes(op.key)) bad('item'); s.ownedStyle = s.ownedStyle.filter(k => k !== op.key); return `${it.it.name} entfernt`; }
    case 'height': {
      const h = int(op.h, 0, 999999), was = s.bestH;
      s.bestH = h;
      if (h < was) { s.milestone = Math.min(s.milestone, Math.floor(h / 1e4)); s.owned = s.owned.filter(k => !CHARS[k].unlock || h >= CHARS[k].unlock); }
      else { s.milestone = Math.max(s.milestone, Math.floor(h / 1e4)); E.unlockHeight(s); }
      return `Rekord ${was} m → ${h} m`;
    }
    case 'prize': {
      const pl = int(op.pl, 1, 3), p = String(op.p || '');
      if (!/^\d{4}-W\d{2}$/.test(p)) bad('week');
      if (s.trophies.wins.some(w => w.p === p)) bad('dup');
      E.tourGrant(s, pl, p);
      v.tpaid = [...new Set([...(v.tpaid || []), p])].slice(-20);
      return `Turnierpreis Platz ${pl} (${p}) vergeben`;
    }
    case 'prizeDel': {
      const i = s.trophies.wins.findIndex(w => w.p === op.p);
      if (i < 0) bad('none');
      const [w] = s.trophies.wins.splice(i, 1), k = 'gsb'[w.pl - 1];
      s.trophies[k] = Math.max(0, s.trophies[k] - 1);
      const parts = [`Pokal Platz ${w.pl} (${w.p}) entfernt`];
      if (op.revoke) {
        const c = Math.min(s.coins, w.coins || 0); s.coins -= c; parts.push(`−${c} Münzen`);
        const ci = s.chests.indexOf(w.chest); if (ci >= 0) { s.chests.splice(ci, 1); parts.push(`${M.CHEST[w.chest].name} weg`); } else parts.push('Truhe war schon geöffnet');
        const t = Math.min(s.tokens.headstart, w.token || 0); s.tokens.headstart -= t;
        if (w.item && !s.trophies.wins.some(x => x.item === w.item)) { s.ownedStyle = s.ownedStyle.filter(k => k !== w.item); parts.push('Siegerkranz weg'); }
      }
      v.tpaid = [...new Set([...(v.tpaid || []), w.p])].slice(-20);   // nicht automatisch neu auszahlen
      return parts.join(', ');
    }
    case 'dprize': {
      const d = String(op.d || ''), r = int(op.r, 1, 99999), n = Math.max(r, int(op.n || r, 1, 99999));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) bad('day');
      if (s.dwins.some(w => w.d === d)) bad('dup');
      const w = E.dailyGrant(s, d, r, n);
      v.dpaid = [...new Set([...(v.dpaid || []), d])].slice(-20);
      return `Tagesauswertung ${d}: Platz ${r} von ${n} (${w.coins} Münzen + ${M.CHEST[w.chest].name})`;
    }
    case 'dprizeDel': {
      const i = s.dwins.findIndex(w => w.d === op.d);
      if (i < 0) bad('none');
      const [w] = s.dwins.splice(i, 1), parts = [`Tagesauswertung ${w.d} entfernt`];
      if (op.revoke) {
        const c = Math.min(s.coins, w.coins || 0); s.coins -= c; parts.push(`−${c} Münzen`);
        const ci = s.chests.indexOf(w.chest); if (ci >= 0) { s.chests.splice(ci, 1); parts.push(`${M.CHEST[w.chest].name} weg`); } else parts.push('Truhe war schon geöffnet');
      }
      v.dpaid = [...new Set([...(v.dpaid || []), w.d])].slice(-20);
      return parts.join(', ');
    }
    case 'reset': {
      const keep = { iapTx: s.iapTx, starter: s.starter };
      v.s = E.ensure({ ...keep });
      return 'Spielstand zurückgesetzt (Käufe bleiben)';
    }
  }
  bad('kind');
}
export const opQueueKey = uid => `adm/q/${uid}`;
// Auftrag speichern + sofort ausführen
export async function runOp(uid, op) {
  const o = { id: rid(8), at: Date.now(), ...op };
  await update(opQueueKey(uid), cur => { const l = (cur && cur.list) || []; l.unshift(o); if (l.length > 100) l.length = 100; return { list: l }; });
  let msg = null, err = null, sum = null;
  await update(`vault/${uid}`, cur => {
    if (!cur) { err = 'novault'; return undefined; }
    cur.admDone ??= [];
    if (cur.admDone.includes(o.id)) return undefined;
    try { msg = applyOp(cur, o); } catch (e) { err = e.code || 'error'; return undefined; }
    cur.admDone.push(o.id); if (cur.admDone.length > 200) cur.admDone.splice(0, cur.admDone.length - 200);
    cur.rev = (cur.rev || 0) + 1; sum = cur;
    return cur;
  });
  if (err) {
    // nicht ausführbar → Auftrag wieder aus der Warteschlange nehmen
    await update(opQueueKey(uid), cur => { if (!cur) return undefined; cur.list = cur.list.filter(x => x.id !== o.id); return cur; }).catch(() => {});
    return { error: err };
  }
  return { ok: true, id: o.id, msg, vault: sum };
}
// Beim Abgleich: Aufträge, die (z. B. durch gleichzeitiges Überschreiben) noch fehlen, nachholen
export async function catchUpOps(uid, v) {
  const q = await store().get(opQueueKey(uid), { type: 'json' }).catch(() => null);
  if (!q || !q.list || !q.list.length) return 0;
  v.admDone ??= [];
  let n = 0;
  for (const o of q.list.slice().reverse()) {
    if (v.admDone.includes(o.id)) continue;
    try { applyOp(v, o); n++; } catch {}
    v.admDone.push(o.id);
  }
  if (v.admDone.length > 200) v.admDone.splice(0, v.admDone.length - 200);
  return n;
}
