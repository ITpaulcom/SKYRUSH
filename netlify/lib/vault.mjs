// SKY RUSH – Tresor: der verbindliche Spielstand jedes Spielers liegt auf dem Server.
// Das Gerät schickt Aktionen, der Server rechnet sie mit den gemeinsamen Regeln (www/economy.js) nach.
// • Münzen aus Läufen: nur aus dem nachgerechneten Lauf (mit Ticket: voll, ohne Ticket/offline: begrenzt)
// • Käufe: nur wenn der Server-Kontostand reicht
// • Truhen und Glücksrad: Zufall nur hier, aus einem geheimen Startwert je Spieler
// • Echtgeld: über RevenueCat geprüft (REVENUECAT_SECRET), jede Transaktion genau einmal
import * as E from '../../www/economy.js';
import { simulate, MAX_TICKS, weekKey, dayKey } from '../../www/core.js';
import { day, TOUR_SETTLE, DAILY_SETTLE, topCut } from '../../www/meta.js';
import { store, update } from './db.mjs';
import { analyze, flag, isBanned } from './anticheat.mjs';
import { verifyRun } from './runs.mjs';
import { catchUpOps, indexPut, summary } from './admin.mjs';
import { applyShopCfg } from './appcfg.mjs';

export const vaultKey = uid => `vault/${uid}`;
const rid = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
// Zufall: geheimer Startwert je Spieler + Zähler → niemand kann Truhen vorhersagen oder neu würfeln
function prng(secret, n) {
  let h = 2166136261; for (const c of secret + ':' + n) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return () => { h = (h + 0x6D2B79F5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const newVault = (s, notes = []) => ({ s: E.ensure(s), rs: rid(16), rc: 0, rev: 0, created: Date.now(), notes });
export async function loadVault(uid) { return store().get(vaultKey(uid), { type: 'json' }); }

// ---------- Läufe ----------
function offlineBudget(v) { const d = day(); if (!v.off || v.off.day !== d) v.off = { day: d, runs: 0, coins: 0 }; return v.off; }
async function processRun(uid, player, v, a) {
  const moves = Array.isArray(a.moves) ? a.moves : null;
  if (!moves) return { ok: false, err: 'moves' };
  let st, mode, info = {};
  let r = null;
  if (a.ticket) {
    r = await verifyRun(uid, player, { ticket: a.ticket, moves, score: a.score });
    // Ticket fehlt/abgelaufen (z. B. Start im Funkloch) → wie ein Offline-Lauf behandeln; alles andere ist eine echte Ablehnung
    if (r.error && !['ticket', 'expired'].includes(r.error)) return { ok: false, err: r.error, why: r.why };
    if (r.error) r = null;
  }
  if (r) { st = r.sim.state; mode = r.mode; info = { rank: r.rank, best: r.best, total: r.total, ranked: r.rankable }; }
  else {
    // Offline gestarteter Lauf: wird nachgerechnet (mit den Server-Werten), aber nur begrenzt gutgeschrieben, keine Rangliste
    mode = ['endless', 'daily', 'tournament'].includes(a.mode) ? a.mode : 'endless';
    if (typeof a.seed !== 'string' || a.seed.length > 48) return { ok: false, err: 'seed' };
    const off = offlineBudget(v);
    if (off.runs >= E.OFFLINE.runs) return { ok: false, err: 'offline-limit' };
    const opts = mode === 'endless' ? { levels: v.s.levels, mult: v.s.mult, ...(a.head && E.useHeadstart(v.s) ? { headstart: true } : {}) } : {};
    const sim = simulate(a.seed, mode, moves, opts, MAX_TICKS);
    if (!sim.ok) { await flag(uid, player.name, 'replay:' + sim.err, { mode, offline: 1 }); return { ok: false, err: 'replay:' + sim.err }; }
    const an = analyze(moves);
    if (an.hard) { await flag(uid, player.name, an.hard, { mode, offline: 1, h: sim.height }); return { ok: false, err: 'rejected', why: an.hard }; }
    st = sim.state; off.runs++;
    const room = Math.max(0, E.OFFLINE.coins - off.coins);
    if (st.coins > room) st.coins = room;
    off.coins += st.coins;
    info = { offline: true, rank: null };
  }
  const quit = !!a.quit || !st.over;
  const res = E.apply(v.s, { t: 'run', mode, coinRev: a.coinRev, quit }, { run: st });
  return { ok: true, res: { ...res, ...info, score: st.score } };
}

// ---------- Duell ----------
async function processDuel(uid, player, v, a, duel) {
  if (a.kind === 'live') {
    const code = String(a.code || '').toUpperCase();
    if (!/^[A-Z2-9]{5}$/.test(code)) return { ok: false, err: 'code' };
    const r = await store().get(duel.roomKey(code), { type: 'json' });
    if (!r || !r.players.some(p => p.u === uid)) return { ok: false, err: 'room' };
    let run = null, was = false;
    await update(duel.runKey(code, uid), cur => { run = cur; was = !!(cur && cur.paid); if (!cur || !cur.final || cur.paid) return undefined; return { ...cur, paid: true }; });
    if (!run || !run.final) return { ok: false, err: 'unfinished', retry: true };
    if (was) return { ok: false, err: 'dup' };
    const { list, rules } = await duel.standings(r, Date.now());
    const i = list.findIndex(x => x.u === uid), me = list[i];
    if (!me || me.dq) return { ok: false, err: 'dq' };
    const tie = !rules.ko && list.some(x => x.u !== uid && x.h === me.h);
    const place = rules.ko ? i + 1 : 1 + list.filter(x => x.u !== uid && x.h > me.h).length;
    const g = { ...run.eco, score: 0 };
    const std = !rules.ko && !rules.collide && rules.time === 90;
    return { ok: true, res: E.apply(v.s, { t: 'duel', kind: 'live', place, tie, n: list.length, std }, { run: g }) };
  }
  // Training gegen Bots (kann offline sein): eigener Lauf wird nachgerechnet, Platz kommt vom Gerät (kleine, gedeckelte Prämie)
  if (typeof a.seed !== 'string' || !a.seed.startsWith('train-') || a.seed.length > 40) return { ok: false, err: 'seed' };
  const off = offlineBudget(v);
  if (off.runs >= E.OFFLINE.runs) return { ok: false, err: 'offline-limit' };
  const moves = Array.isArray(a.moves) ? a.moves : [];
  const sim = simulate(a.seed, 'duel', moves, {}, Math.max(0, Math.min(90 * 60, Number(a.tick) || 0)));
  if (!sim.ok) return { ok: false, err: 'replay:' + sim.err };
  if (analyze(moves).hard) return { ok: false, err: 'rejected' };
  off.runs++;
  const st = sim.state, room = Math.max(0, E.OFFLINE.coins - off.coins); if (st.coins > room) st.coins = room; off.coins += st.coins;
  return { ok: true, res: E.apply(v.s, { t: 'duel', kind: 'train', place: a.place, tie: a.tie, n: 4 }, { run: st }) };
}

// ---------- Echtgeld (RevenueCat) ----------
async function processIap(uid, player, v, a) {
  const key = process.env.REVENUECAT_SECRET;
  if (!key) {
    // Noch nicht eingerichtet: Kauf vom Gerät übernehmen, aber vermerken (Zentrale) – mit Schlüssel prüft der Server selbst
    try { const res = E.apply(v.s, { t: 'iap', tx: a.tx, pack: a.pack }); await flag(uid, player.name, 'iap-unverified', { pack: a.pack }); return { ok: true, res }; }
    catch (e) { return { ok: false, err: e.code || 'iap' }; }
  }
  let data;
  try {
    const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' } });
    if (!r.ok) return { ok: false, err: 'iap-check', retry: true };
    data = await r.json();
  } catch { return { ok: false, err: 'iap-check', retry: true }; }
  const got = [];
  for (const [pid, txs] of Object.entries(data?.subscriber?.non_subscriptions || {})) {
    if (!E.packOf(pid)) continue;
    for (const tx of txs || []) {
      const id = tx.store_transaction_id || tx.id;
      if (!id || v.s.iapTx.includes(id)) continue;
      try { got.push({ pack: pid, ...E.apply(v.s, { t: 'iap', tx: id, pack: pid }) }); } catch {}
    }
  }
  return { ok: true, res: { got } };
}

// ---------- Abgleich ----------
const RNG_ACTIONS = new Set(['chest', 'spin']);
// Was der Server über den Rekord eines Spielers belegen kann: Endlos-Rangliste (nachgerechnete Läufe) und aufbewahrtes Spitzen-Replay
export async function proof(uid) {
  const st = store();
  const [board, rep] = await Promise.all([st.get('boards/endless/all', { type: 'json' }).catch(() => null), st.get(`ac/r/endless/all/${uid}`, { type: 'json' }).catch(() => null)]);
  const e = board && Array.isArray(board.entries) ? board.entries.find(x => x.u === uid) : null;
  const h = Math.max(0, Math.floor(Number(e ? e.h ?? e.s : 0) || 0), Math.floor(Number(rep && rep.h) || 0));
  return { h, rep: rep && rep.opts && typeof rep.opts === 'object' ? rep.opts : null };
}
// Stand der einmaligen Reparaturen: 2 = Übernahme-Fehler bis 2.0.0 behoben, 3 = Gadget-Stufen aus der Übernahme zurück
export const FIX = 3;
async function repairOnce(uid, player, v, b) {
  const was = v.fix || 0;
  if (was >= FIX) return null;
  v.fix = FIX;
  if (await isBanned(uid)) return null;
  const p = await proof(uid);
  const fresh = !!(player.created && v.created && v.created - player.created < 15 * 60e3);
  const out = { h: 0, chars: [], items: [], coins: 0, levels: false, mult: 0, lv: null, lvCoins: 0 };
  const tags = [];
  if (was < 2) {
    const wear = b.wear && typeof b.wear === 'object' ? { char: String(b.wear.char || ''), style: b.wear.style } : null;
    const got = E.repair(v.s, { notes: v.notes || [], proven: p.h, rep: p.rep, wear, fresh });
    if (got.any) {
      Object.assign(out, { h: got.h, chars: got.chars, items: got.items, coins: got.coins, levels: got.levels, mult: got.mult });
      tags.push(got.h && 'h' + got.h, got.chars.length && got.chars.join('+'), got.coins && 'c' + got.coins, got.items.length && 'i' + got.items.length, got.levels && 'lv', got.mult && 'x' + got.mult);
    }
  }
  const lv = E.repairLevels(v.s, { notes: v.notes || [], proven: p.h, rep: p.rep, fresh });
  if (lv.levels || lv.coins) {
    out.lv = lv.levels; out.lvCoins = lv.coins; out.coins += lv.coins; if (lv.levels) out.levels = true;
    tags.push(lv.levels && 'stufen ' + Object.values(lv.from).join('.') + '→' + Object.values(lv.levels).join('.'), lv.coins && 'erstattet ' + lv.coins);
  }
  const t = tags.filter(Boolean);
  if (!t.length) return null;
  v.restored = { ...out, at: Date.now() };
  await flag(uid, player.name, 'restored:' + t.join(','));
  return { ...out, bestH: v.s.bestH };
}

// Admin: Gadget-Stufen von Hand zurückgeben (z. B. nach einer Meldung), optional Münzen erstatten
export async function setLevels(uid, levels, coins = 0) {
  let out = null;
  await update(vaultKey(uid), cur => {
    if (!cur) { out = { error: 'novault' }; return undefined; }
    E.ensure(cur.s);
    const from = { ...cur.s.levels }, next = {};
    for (const k of Object.keys(from)) next[k] = Math.max(from[k], Math.max(0, Math.min(15, Math.floor(Number(levels && levels[k]) || 0))));
    const c = Math.max(0, Math.min(2e6, Math.floor(Number(coins) || 0)));
    if (Object.keys(from).every(k => next[k] === from[k]) && !c) { out = { ok: true, same: true, levels: from }; return undefined; }
    cur.s.levels = next; cur.s.coins += c;
    cur.pend = { ...(cur.pend || { h: 0, chars: [], items: [], coins: 0, bestH: cur.s.bestH }), lv: next, levels: true, coins: ((cur.pend && cur.pend.coins) || 0) + c, lvCoins: c };
    out = { ok: true, levels: next, coins: c };
    return cur;
  });
  return out;
}

// Admin: Rekord eines Spielers von Hand bestätigen (z. B. wenn er nie online in der Rangliste stand) → Höhen-Figuren frei
export async function setHeight(uid, h) {
  let out = null;
  await update(vaultKey(uid), cur => {
    if (!cur) { out = { error: 'novault' }; return undefined; }
    E.ensure(cur.s);
    if (h <= cur.s.bestH) { out = { ok: true, same: true, bestH: cur.s.bestH }; return undefined; }
    const was = cur.s.bestH;
    cur.s.bestH = h; cur.s.milestone = Math.max(cur.s.milestone, Math.floor(h / 10000));
    const chars = E.unlockHeight(cur.s);
    cur.pend = { h, chars, items: [], coins: 0, bestH: h, was };
    out = { ok: true, bestH: h, chars };
    return cur;
  });
  return out;
}

// ---------- Wochenturnier: Preise für Platz 1–3 ----------
// Nach Wochenende + Prüfzeit (TOUR_SETTLE) beim nächsten Abgleich: die letzten drei abgeschlossenen Wochen ansehen,
// einmal je Woche auszahlen. Gesperrte Spieler zählen nicht mit (wer dahinter lag, rückt auf). Höchstens ein Blick pro Woche.
const WEEK = 7 * 86400e3;
export async function tourPrizes(uid, player, v, now = Date.now()) {
  const ref = now - TOUR_SETTLE, closed = weekKey(new Date(ref - WEEK));
  if (v.tpc === closed) return [];
  const paid = Array.isArray(v.tpaid) ? v.tpaid : [];
  const weeks = [1, 2, 3].map(k => weekKey(new Date(ref - k * WEEK))).filter(p => !paid.includes(p));
  const st = store();
  let bans, boards;
  try { [bans, ...boards] = await Promise.all([st.get('ac/bans', { type: 'json' }), ...weeks.map(p => st.get(`boards/tournament/${p}`, { type: 'json' }))]); }
  catch { return []; }   // Speicher gerade nicht erreichbar → beim nächsten Abgleich nochmal
  v.tpc = closed; v.tpaid = paid;
  bans = bans || {};
  if (bans[uid]) return [];
  const out = [];
  weeks.forEach((p, i) => {
    const list = (boards[i] && Array.isArray(boards[i].entries) ? boards[i].entries : []).filter(e => e && !bans[e.u] && e.s > 0);
    const place = list.slice(0, 3).findIndex(e => e.u === uid) + 1;
    if (!place) return;
    const w = E.tourGrant(v.s, place, p);
    if (!w) return;
    paid.push(p); if (paid.length > 20) paid.splice(0, paid.length - 20);
    out.push(w);
  });
  for (const w of out) await flag(uid, player.name, 'tourprize:' + w.pl, { mode: 'tournament', period: w.p });
  return out;
}

// ---------- Tages-Run: Auswertung nach Tagesende ----------
// Wie beim Turnier: nach 24 Uhr UTC + Prüfzeit beim nächsten Abgleich die letzten drei abgeschlossenen Tage ansehen.
// Jeder, der in der Tages-Rangliste steht, bekommt seine Platzierungs-Belohnung (Gesperrte zählen nicht mit).
const DAY = 86400e3;
export async function dailyPrizes(uid, player, v, now = Date.now()) {
  const ref = now - DAILY_SETTLE, closed = dayKey(new Date(ref - DAY));
  if (v.dpc === closed) return [];
  const paid = Array.isArray(v.dpaid) ? v.dpaid : [];
  const days = [1, 2, 3].map(k => dayKey(new Date(ref - k * DAY))).filter(d => !paid.includes(d));
  const st = store();
  let bans, boards;
  try { [bans, ...boards] = await Promise.all([st.get('ac/bans', { type: 'json' }), ...days.map(d => st.get(`boards/daily/${d}`, { type: 'json' }))]); }
  catch { return []; }
  v.dpc = closed; v.dpaid = paid;
  bans = bans || {};
  if (bans[uid]) return [];
  const out = [];
  days.forEach((d, i) => {
    const list = (boards[i] && Array.isArray(boards[i].entries) ? boards[i].entries : []).filter(e => e && !bans[e.u] && e.s > 0);
    const rank = list.findIndex(e => e.u === uid) + 1;
    if (!rank) return;
    paid.push(d); if (paid.length > 20) paid.splice(0, paid.length - 20);
    // Umstellungstag: wer an diesem Tag schon die alte Sofort-Belohnung bekam, bekommt nur noch etwas für Top-Plätze
    if (v.s.dprize === d && rank > topCut(list.length)) return;
    out.push(E.dailyGrant(v.s, d, rank, list.length));
  });
  return out;
}

export async function sync(uid, player, b, duel) {
  await applyShopCfg().catch(() => {});   // Preise/Rabatte aus der Zentrale – gleich wie auf dem Gerät
  const st = store(), key = vaultKey(uid);
  let v = await st.get(key, { type: 'json' }), created = false, restored = null;
  if (!v) {
    const p = b.init && typeof b.init === 'object' ? await proof(uid) : { h: 0 };
    const fresh = !!(player.created && Date.now() - player.created < 15 * 60e3);   // Konto eben erst angelegt → kleiner Rahmen
    const m = b.init && typeof b.init === 'object' ? E.migrate(b.init, { proven: p.h, fresh }) : { s: E.ensure({}), notes: [] };
    v = newVault(m.s, m.notes); v.fix = FIX; created = true;
    if (m.notes.length) await flag(uid, player.name, 'init:' + m.notes.join(','));
  } else restored = await repairOnce(uid, player, v, b);
  if (v.pend) {
    const q = v.pend;
    restored = restored ? { ...restored, chars: [...new Set([...restored.chars, ...(q.chars || [])])], coins: (restored.coins || 0) + (q.coins || 0), lv: q.lv || restored.lv, levels: !!(q.levels || restored.levels), lvCoins: (restored.lvCoins || 0) + (q.lvCoins || 0), bestH: v.s.bestH } : q;
    delete v.pend;
  }
  if (!created) await catchUpOps(uid, v).catch(() => 0);   // Änderungen aus der Zentrale, die noch fehlen
  E.ensure(v.s); E.housekeeping(v.s);
  const prizes = await tourPrizes(uid, player, v), dailies = await dailyPrizes(uid, player, v);
  const results = {}, acts = Array.isArray(b.actions) ? b.actions.slice(0, 60) : [];
  v.done ??= [];
  for (const a of acts) {
    if (!a || typeof a !== 'object' || typeof a.id !== 'string' || a.id.length > 40) continue;
    if (v.done.includes(a.id)) { results[a.id] = (v.last && v.last[a.id]) || { ok: true, dup: true }; continue; }   // schon verarbeitet (Antwort ging verloren)
    try {
      let r;
      if (a.t === 'run') r = await processRun(uid, player, v, a);
      else if (a.t === 'duel') r = await processDuel(uid, player, v, a, duel);
      else if (a.t === 'iap') r = await processIap(uid, player, v, a);
      else r = { ok: true, res: E.apply(v.s, a, RNG_ACTIONS.has(a.t) ? { rnd: prng(v.rs, v.rc++) } : {}) };
      results[a.id] = r;
    } catch (e) { results[a.id] = { ok: false, err: e.code || 'error' }; }
    if (!results[a.id].retry) {
      v.done.push(a.id); if (v.done.length > 300) v.done.splice(0, v.done.length - 300);
      // letzte Antworten aufheben: geht eine verloren, bekommt das Gerät beim erneuten Senden dieselbe (z. B. Truheninhalt)
      v.last ??= {}; v.last[a.id] = results[a.id]; const ks = Object.keys(v.last); if (ks.length > 12) for (const k of ks.slice(0, ks.length - 12)) delete v.last[k];
    }
  }
  v.rev = (v.rev || 0) + 1; v.at = Date.now();
  // Spielerverzeichnis für die Zentrale: höchstens alle 10 Minuten (oder wenn sich Wichtiges geändert hat)
  const ix = created || prizes.length || dailies.length || restored || !v.ixAt || v.at - v.ixAt > 10 * 60e3;
  if (ix) v.ixAt = v.at;
  await st.setJSON(key, v);
  if (ix) await indexPut(uid, summary(player, v)).catch(() => {});
  return { ok: true, rev: v.rev, econ: E.econOf(v.s), results, created, ...(restored ? { restored } : {}), ...(prizes.length ? { prizes } : {}), ...(dailies.length ? { dailies } : {}) };
}

// Lauf-Ticket: Aufrüstungen und Kopfstart kommen aus dem Tresor (nicht vom Gerät)
export async function ticketOpts(uid, mode, wantHead) {
  if (mode !== 'endless') return {};
  let opts = null;
  await update(vaultKey(uid), cur => {
    if (!cur) return undefined;
    E.ensure(cur.s);
    const head = wantHead === true && E.useHeadstart(cur.s);
    opts = { levels: cur.s.levels, mult: cur.s.mult, ...(head ? { headstart: true } : {}) };
    return head ? cur : undefined;
  });
  return opts;
}
