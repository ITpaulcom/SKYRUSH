// /api/admin – Zentrale. Erst anmelden (POST { action: 'login', key }), danach mit „Authorization: Bearer <Sitzung>“.
//   GET  ?view=dash            Werbung, Ranglisten (inkl. Vorwoche mit Preis-Status), Anti-Cheat, Sperren, Kennzahlen
//   GET  ?view=players         alle Spieler (Verzeichnis)
//   GET  ?view=player&uid=…    ein Spieler: Spielstand, Ränge, Aufträge, Auffälligkeiten, Protokoll
//   GET  ?view=money           Einnahmen: geprüfte Käufe pro Tag (Werbung steht in dash)
//   GET  ?view=log | security  Protokoll · Anmeldungen/Sperren
//   POST { action: 'op', uid, op: { kind, … }, why }   Spielstand ändern (hoch- oder runterstufen)
//   POST { action: 'ban' | 'unban' | 'unboard' | 'rename' | 'reindex' | 'logout' | 'logoutAll' | 'height' | 'levels' | 'unlinkGoogle', … }
//   GET  ?view=config · POST { action: 'config', cfg }   Werbung, Werbe-Anbieter, Google-Anmeldung (gilt ohne App-Update)
import { json, preflight, store, update, cleanName } from '../lib/db.mjs';
import { dayKey, weekKey } from '../../www/core.js';
import * as E from '../../www/economy.js';
import { TOUR_SETTLE, tourEnd, DAILY_SETTLE, dayEnd, dailyTier } from '../../www/meta.js';
import { setBan, unboard, flag } from '../lib/anticheat.mjs';
import { setHeight, setLevels } from '../lib/vault.mjs';
import { login, session, logout, securityInfo, log, readLog, readIndex, indexPut, summary, reindex, runOp, opQueueKey } from '../lib/admin.mjs';
import { readCfg, writeCfg, PLACEMENTS } from '../lib/appcfg.mjs';
import { shopItems, applyShop } from '../../www/shopcfg.js';
import { PACKS, STYLE } from '../../www/catalog.js';
import { CONFIG as BASE } from '../../www/config.js';
import { salesDays, LIST_EUR } from '../lib/sales.mjs';

const UID = /^[a-f0-9-]{36}$/;
const OPS = new Set(['coins', 'levels', 'mult', 'tokens', 'level', 'chestAdd', 'chestDel', 'charAdd', 'charDel', 'styleAdd', 'styleDel', 'height', 'prize', 'prizeDel', 'dprize', 'dprizeDel', 'reset']);

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  const noStore = { 'Cache-Control': 'no-store' };
  let b = {};
  if (req.method === 'POST') { b = await req.json().catch(() => ({})); if (!b || typeof b !== 'object') b = {}; }
  if (b.action === 'login') { const r = await login(req, b.key); const { status, ...rest } = r; return json(rest, status, noStore); }
  const sess = await session(req);
  if (!sess) return json({ error: 'auth' }, 401, noStore);
  const st = store();

  if (req.method === 'POST') {
    if (b.action === 'logout') { await logout(req); return json({ ok: true }); }
    if (b.action === 'logoutAll') { const n = await logout(req, true); await log(req, 'logout-all', null, n + ' Sitzungen'); return json({ ok: true, n }); }
    if (b.action === 'reindex') return json(await reindex(Math.max(0, Number(b.offset) || 0)));
    if (b.action === 'config') {
      const before = await readCfg(true), r = await writeCfg({ ...(b.cfg || {}), shop: before.shop }, 'Zentrale');
      if (r.errors) return json({ error: 'invalid', fields: r.errors }, 400);
      const flat = (o, p = '') => Object.entries(o || {}).flatMap(([k, v]) => v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p + k + '.') : v === '' ? [] : [[p + k, JSON.stringify(v)]]);
      const old = Object.fromEntries(flat({ ads: before.ads, google: before.google })), now = flat({ ads: r.cfg.ads, google: r.cfg.google });
      const diff = now.filter(([k, v]) => old[k] !== v).map(([k, v]) => `${k}=${v}`).concat(Object.keys(old).filter(k => !now.some(([n]) => n === k)).map(k => k + '=Standard'));
      await log(req, 'config', null, (diff.join(' · ') || 'keine Änderung').slice(0, 400));
      return json({ ok: true, cfg: r.cfg });
    }
    if (b.action === 'shop') {
      const before = await readCfg(true), r = await writeCfg({ ads: before.ads, google: before.google, shop: b.shop || {} }, 'Zentrale');
      if (r.errors) return json({ error: 'invalid', fields: r.errors }, 400);
      const n = Object.keys((r.cfg.shop || {}).items || {}).length, sl = (r.cfg.shop || {}).sale;
      await log(req, 'shop', null, `${n} Artikel angepasst${sl ? ` · Rabatt ${sl.pct} %` : ''}`);
      return json({ ok: true, shop: r.cfg.shop || {} });
    }
    if (!UID.test(b.uid || '')) return json({ error: 'uid' }, 400);
    const p = await st.get(`players/${b.uid}`, { type: 'json' });
    const name = (p && p.name) || '';
    const why = String(b.why || '').slice(0, 160);
    const refresh = async () => { const v = await st.get(`vault/${b.uid}`, { type: 'json' }); const bans = (await st.get('ac/bans', { type: 'json' })) || {}; await indexPut(b.uid, { ...summary(p, v), b: bans[b.uid] ? 1 : 0 }).catch(() => {}); };
    if (b.action === 'op') {
      const op = b.op && typeof b.op === 'object' ? b.op : {};
      if (!OPS.has(op.kind)) return json({ error: 'kind' }, 400);
      const r = await runOp(b.uid, { ...op, why });
      if (r.error) return json(r, r.error === 'novault' ? 404 : 400);
      await log(req, 'op:' + op.kind, b.uid, r.msg + (why ? ' · Grund: ' + why : ''), name);
      await refresh();
      return json({ ok: true, msg: r.msg });
    }
    if (b.action === 'ban' || b.action === 'unban') {
      await setBan(b.uid, b.action === 'ban' ? (why || 'gesperrt') : null);
      await log(req, b.action, b.uid, why, name); await refresh();
      return json({ ok: true });
    }
    if (b.action === 'unboard') {
      const out = await unboard(b.uid, ['daily', 'tournament', 'endless'].includes(b.board) ? b.board : null);
      await log(req, 'unboard', b.uid, Object.entries(out).map(([k, v]) => `${k} #${v}`).join(', ') + (why ? ' · Grund: ' + why : ''), name);
      return json({ ok: true, removed: out });
    }
    if (b.action === 'rename') {
      const n = cleanName(b.name);
      if (!p || n.length < 3) return json({ error: 'name' }, 400);
      await update(`players/${b.uid}`, cur => (cur ? { ...cur, name: n, updated: Date.now() } : undefined));
      for (const [m, per] of [['daily', dayKey()], ['tournament', weekKey()], ['endless', 'all']])
        await update(`boards/${m}/${per}`, cur => { const e = cur && cur.entries.find(x => x.u === b.uid); if (!e) return undefined; e.n = n; return cur; }).catch(() => {});
      await log(req, 'rename', b.uid, `${name} → ${n}`, n); await indexPut(b.uid, { n }).catch(() => {});
      return json({ ok: true, name: n });
    }
    if (b.action === 'height') {
      // ältere Zentrale: Rekord bestätigen (nur hoch) – Höhen-Figuren werden freigeschaltet
      const h = Math.floor(Number(b.h));
      if (!(h > 0 && h < 1000000)) return json({ error: 'h' }, 400);
      const r = await setHeight(b.uid, h);
      if (r && r.ok && !r.same) { await flag(b.uid, '', 'admin-h:' + h); await log(req, 'height', b.uid, h + ' m', name); await refresh(); }
      return json(r || { error: 'busy' }, r && r.error ? 404 : 200);
    }
    if (b.action === 'unlinkGoogle') {
      const ul = await st.get(`acct/u/${b.uid}`, { type: 'json' });
      if (!ul) return json({ error: 'none' }, 404);
      const gl = await st.get(`acct/g/${ul.sub}`, { type: 'json' });
      if (gl && gl.uid === b.uid) await st.delete(`acct/g/${ul.sub}`);
      await st.delete(`acct/u/${b.uid}`); await indexPut(b.uid, { g: '' }).catch(() => {});
      await log(req, 'unlink-google', b.uid, ul.email + (why ? ' · Grund: ' + why : ''), name);
      return json({ ok: true });
    }
    if (b.action === 'levels') {
      const r = await setLevels(b.uid, b.levels, b.coins);
      if (r && r.ok && !r.same) { await flag(b.uid, '', 'admin-lv:' + Object.values(r.levels).join('.') + (r.coins ? '+' + r.coins : '')); await log(req, 'levels', b.uid, Object.values(r.levels).join('.'), name); await refresh(); }
      return json(r || { error: 'busy' }, r && r.error ? 404 : 200);
    }
    return json({ error: 'action' }, 400);
  }

  const q = new URL(req.url).searchParams, view = q.get('view') || 'dash';
  if (view === 'players') {
    const [list, bans] = await Promise.all([readIndex(), st.get('ac/bans', { type: 'json' })]);
    return json({ players: list.map(e => ({ ...e, b: bans && bans[e.u] ? 1 : 0 })), now: Date.now() }, 200, noStore);
  }
  if (view === 'log') return json({ log: await readLog() }, 200, noStore);
  if (view === 'config') {
    const c = await readCfg(true);
    // Grundwerte aus config.js (gelten, solange in der Zentrale nichts eingetragen ist) – App-IDs nur zur Info, die stehen fest in der App
    const a = BASE.ads || {};
    return json({ cfg: { ads: c.ads || {}, google: c.google || {} }, updated: c.updated || 0, envClientId: !!process.env.GOOGLE_CLIENT_ID, placements: PLACEMENTS,
      base: { testMode: !!a.testMode, androidAppId: a.androidAppId || '', iosAppId: a.iosAppId || '', android: a.android || {}, ios: a.ios || {}, webPublisherId: a.webPublisherId || '', testDeviceIds: a.testDeviceIds || [], interstitial: a.interstitial || {}, rewardedMaxPerDay: a.rewardedMaxPerDay, estimatedEcpm: a.estimatedEcpm || {} } }, 200, noStore);
  }
  if (view === 'shop') {
    const c = await readCfg(true); applyShop({});   // Grundpreise zeigen
    const items = shopItems().map(x => ({ id: x.id, cat: x.cat, name: x.name, base: x.base, rar: x.rar || '' }));
    const cats = Object.fromEntries(Object.entries(STYLE).map(([k, v]) => [k, v.title])); cats.char = 'Figuren';
    const packs = PACKS.filter(p => !p.baseHidden).map(p => ({ id: p.id, coins: p.coins, tag: p.baseTag || '', once: !!p.once }));
    applyShop(c.shop);
    return json({ shop: c.shop || {}, items, cats, packs, updated: c.updated || 0 }, 200, noStore);
  }
  if (view === 'addiag') {   // Werbe-Diagnose der letzten 3 Tage
    const days = [0, 1, 2].map(i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
    const rows = (await Promise.all(days.map(d => st.get(`addiag/${d}`, { type: 'json' })))).flatMap(x => (x && x.rows) || []).sort((a, b) => b.at - a.at).slice(0, 80);
    return json({ rows }, 200, noStore);
  }
  if (view === 'accounts') {   // Google-Login: letzte Anmeldeversuche und an welchem Schritt sie stehen
    const rec = ((await st.get('acct/recent', { type: 'json' })) || { list: [] }).list.slice(0, 40);
    const rows = await Promise.all(rec.map(async r => {
      const [c, p] = await Promise.all([st.get(`acct/c/${r.code}`, { type: 'json' }), st.get(`players/${r.uid}`, { type: 'json' })]);
      const tv = c && c.target ? await st.get(`vault/${c.target}`, { type: 'json' }) : null;
      return { at: r.at, uid: r.uid, name: (p && p.name) || '', src: r.src || (c && c.src) || '', state: c ? c.state : 'gone', exp: c ? c.exp : 0, done: c && c.done || 0, seen: c && c.seen || 0, used: c && c.used || 0, email: c && c.email ? c.email.replace(/^(.).*(@.*)$/, '$1…$2') : '', target: c && c.target || '', synced: !!(tv && c && c.used && tv.at > c.used) };
    }));
    return json({ rows, now: Date.now() }, 200, noStore);
  }
  if (view === 'money') return json({ sales: await salesDays(Math.min(400, Number(q.get('days') || 90))), list: LIST_EUR, rc: !!process.env.REVENUECAT_SECRET, now: Date.now() }, 200, noStore);
  if (view === 'security') return json(await securityInfo(), 200, noStore);
  if (view === 'player') {
    const uid = q.get('uid') || '';
    if (!UID.test(uid)) return json({ error: 'uid' }, 400);
    const prevW = weekKey(new Date(Date.now() - 7 * 86400000));
    const bk = [['daily', dayKey()], ['tournament', weekKey()], ['tournament', prevW], ['endless', 'all']];
    const [p, v, ops, bans, flags, logl, acct, ...boards] = await Promise.all([
      st.get(`players/${uid}`, { type: 'json' }), st.get(`vault/${uid}`, { type: 'json' }), st.get(opQueueKey(uid), { type: 'json' }),
      st.get('ac/bans', { type: 'json' }), st.get('ac/flags', { type: 'json' }), readLog(), st.get(`acct/u/${uid}`, { type: 'json' }), ...bk.map(([m, per]) => st.get(`boards/${m}/${per}`, { type: 'json' })),
    ]);
    if (!p && !v) return json({ error: 'unknown' }, 404);
    const ranks = bk.map(([m, per], i) => { const l = (boards[i] && boards[i].entries) || [], j = l.findIndex(e => e.u === uid); return { m, per, rank: j >= 0 ? j + 1 : null, total: l.length, score: j >= 0 ? l[j].s : null, h: j >= 0 ? l[j].h : null }; });
    const done = new Set((v && v.admDone) || []);
    return json({
      uid, player: p ? { name: p.name, country: p.country, created: p.created, updated: p.updated, devices: 1 + ((p.hashes || []).length) } : null,
      google: acct ? { email: acct.email, at: acct.at } : null,
      vault: v ? { s: E.econOf(E.ensure(v.s)), created: v.created, at: v.at, rev: v.rev, notes: v.notes || [], tpaid: v.tpaid || [], dpaid: v.dpaid || [], restored: v.restored || null } : null,
      ops: ((ops && ops.list) || []).map(o => ({ ...o, done: done.has(o.id) })),
      ban: bans && bans[uid] ? bans[uid] : null,
      flags: ((flags && flags.list) || []).filter(f => f.u === uid).slice(0, 60),
      log: logl.filter(l => l.u === uid).slice(0, 60), ranks,
    }, 200, noStore);
  }

  // ---------- Übersicht ----------
  const days = Math.min(90, Number(q.get('days') || 30)), out = [];
  for (let i = 0; i < days; i++) {
    const day = dayKey(new Date(Date.now() - i * 86400000));
    const shards = await Promise.all(Array.from({ length: 16 }, (_, s) => st.get(`rev/${day}/${s}`, { type: 'json' })));
    const row = { day, formats: {}, placements: {}, revenue: 0, impressions: 0, users: 0, estimated: 0, currency: 'USD' };
    for (const d of shards) {
      if (!d) continue;
      row.currency = d.currency || row.currency;
      row.users += Object.keys(d.users).length;
      for (const [k, v] of Object.entries(d.p || {})) { const r = row.placements[k] || (row.placements[k] = { n: 0, revenue: 0 }); r.n += v.n; r.revenue += v.micros / 1e6; }
      for (const [k, f] of Object.entries(d.f)) {
        const r = row.formats[k] || (row.formats[k] = { n: 0, revenue: 0 });
        r.n += f.n; r.revenue += f.micros / 1e6; row.revenue += f.micros / 1e6; row.impressions += f.n; row.estimated += f.est / 1e6;
      }
    }
    out.push(row);
  }
  const bans = (await st.get('ac/bans', { type: 'json' })) || {};
  const prevWeek = weekKey(new Date(Date.now() - 7 * 86400000)), payAt = tourEnd(new Date(Date.now() - 7 * 86400000)) + TOUR_SETTLE;
  const yday = dayKey(new Date(Date.now() - 86400000)), dPayAt = dayEnd(new Date(Date.now() - 86400000)) + DAILY_SETTLE;
  const boards = {};
  for (const [k, m, p] of [['daily', 'daily', dayKey()], ['dailyPrev', 'daily', yday], ['tournament', 'tournament', weekKey()], ['tourPrev', 'tournament', prevWeek], ['endless', 'endless', 'all']]) {
    const bd = await st.get(`boards/${m}/${p}`, { type: 'json' });
    const top = bd ? bd.entries.slice(0, 10).map(e => ({ uid: e.u, name: e.n, country: e.c, score: e.s, height: e.h, banned: !!bans[e.u] })) : [];
    if (k === 'tourPrev') {
      // Preis-Status der Top 3 (Gesperrte zählen nicht)
      const podium = top.filter(e => !e.banned).slice(0, 3);
      await Promise.all(podium.map(async (e, i) => {
        const v = await st.get(`vault/${e.uid}`, { type: 'json' });
        e.place = i + 1;
        e.prize = v && (v.tpaid || []).includes(p) ? 'paid' : Date.now() < payAt ? 'soon' : 'waiting';
      }));
    }
    if (k === 'dailyPrev') {
      const ok = top.filter(e => !e.banned), total = bd ? bd.entries.filter(e => !bans[e.u]).length : 0;
      await Promise.all(ok.slice(0, 3).map(async (e, i) => {
        const v = await st.get(`vault/${e.uid}`, { type: 'json' });
        e.place = i + 1; e.total = total;
        e.prize = v && (v.dpaid || []).includes(p) ? 'paid' : Date.now() < dPayAt ? 'soon' : 'waiting';
      }));
    }
    boards[k] = { period: p, players: bd ? bd.entries.length : 0, top, ...(k === 'tourPrev' ? { payAt } : k === 'dailyPrev' ? { payAt: dPayAt } : {}) };
  }
  const flags = ((await st.get('ac/flags', { type: 'json' })) || { list: [] }).list.slice(0, 150);
  return json({ days: out, boards, flags, bans, now: Date.now() }, 200, noStore);
};
export const config = { path: '/api/admin' };
