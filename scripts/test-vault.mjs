// Tresor-Test: Münzen und Freischaltungen sind serverseitig – Manipulation am Gerät bringt nichts.
import run from '../netlify/functions/run.mjs';
import vault from '../netlify/functions/vault.mjs';
import duel from '../netlify/functions/duel.mjs';
import playerFn from '../netlify/functions/player.mjs';
import admin from '../netlify/functions/admin.mjs';
import { __data } from './mock/blobs.mjs';
import { makeBot } from '../www/bot.js';
import * as C from '../www/core.js';
import * as E from '../www/economy.js';
import { UPGRADE_COST, CHARS, STYLE } from '../www/catalog.js';

let ok = 0, bad = 0;
const t = (c, m) => { if (c) ok++; else { bad++; console.log('✖', m); } };
let NOW = Date.now(); Date.now = () => NOW;
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const P = () => ({ uid: crypto.randomUUID(), secret: hex(20) });
const post = async (fn, path, body) => { const r = await fn(new Request('http://x' + path, { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, ...(await r.json()) }; };
let n = 0; const aid = () => 'a' + (++n) + hex(3);
const V = (p, actions = [], extra = {}) => post(vault, '/api/vault', { ...p, actions, ...extra });
const R = (p, action, body = {}) => post(run, '/api/run', { ...p, action, ...body });
function play(seed, mode, opts, skill = .7, maxTicks = 60 * 40) {
  const st = C.createGame(seed, mode, opts), think = makeBot(skill, 5);
  while (!st.over && st.tick < maxTicks) { const c = think(st); if (c) C.input(st, c); C.step(st); st.events.length = 0; }
  return st;
}

// ---------- 1) Neues Gerät: gefälschter Spielstand wird beim ersten Abgleich gedeckelt ----------
const A = P();
let r = await V(A, [], { init: { coins: 9999999, levels: { jet: 15, magnet: 15, shield: 15, boots: 15 }, owned: Object.keys(CHARS), mult: 30, bestH: 99999 } });
t(r.ok && r.econ.coins <= 5000, 'Münzen beim Übernehmen gedeckelt: ' + r.econ.coins);
t(Object.values(r.econ.levels).reduce((a, l) => a + UPGRADE_COST.slice(0, l).reduce((x, y) => x + y, 0), 0) <= 5000 && r.econ.mult <= 5, 'Stufen/Multiplikator gedeckelt ' + JSON.stringify(r.econ.levels));
t(!r.econ.owned.some(k => CHARS[k].unlock) && r.econ.owned.reduce((a, k) => a + CHARS[k].price, 0) <= 10000 && r.econ.bestH <= 9999, 'Figuren nicht einfach übernommen, Rekord ohne Beleg ≤ 9.999 m: ' + r.econ.owned.join(','));
t((await V(A, [], { init: { coins: 1e6 } })).econ.coins <= 5000, 'zweites „init“ wird ignoriert');

// ---------- 2) Kaufen geht nur mit echtem Server-Guthaben ----------
const B = P(); await V(B);
let id = aid(); r = await V(B, [{ id, t: 'buyChar', k: 'uni' }]);
t(!r.results[id].ok && r.results[id].err === 'coins' && !r.econ.owned.includes('uni'), 'Kauf ohne Guthaben abgelehnt (egal was das Gerät meint)');
id = aid(); r = await V(B, [{ id, t: 'upgrade', k: 'jet' }]);
t(!r.results[id].ok && r.econ.levels.jet === 0, 'Upgrade ohne Guthaben abgelehnt');
id = aid(); r = await V(B, [{ id, t: 'buyChar', k: 'aurum' }]);
t(!r.results[id].ok, 'Höhen-Figur nicht kaufbar');

// ---------- 3) Münzen aus Läufen: nur was der Server nachrechnet ----------
const s1 = (await R(B, 'seed')).seed, tk = hex(12);
t((await R(B, 'begin', { id: tk, mode: 'endless', seed: s1, opts: { levels: { jet: 15, magnet: 15, shield: 15, boots: 15 }, mult: 30 } })).ok, 'Lauf-Start');
let g = play(s1, 'endless', { levels: { jet: 0, magnet: 0, shield: 0, boots: 0 }, mult: 1 }), sim = C.simulate(s1, 'endless', g.inputs, { levels: { jet: 0, magnet: 0, shield: 0, boots: 0 }, mult: 1 });
NOW += sim.ticks / 60 * 1000 + 1000;
id = aid(); r = await V(B, [{ id, t: 'run', ticket: tk, moves: g.inputs, score: sim.score }]);
t(r.results[id].ok && r.econ.coins === sim.coins + (r.results[id].res.ups || []).reduce((a, u) => a + u.coins, 0) + (r.results[id].res.achs || []).reduce((a, x) => a + x.reward, 0), 'Lauf gutgeschrieben – genau die nachgerechneten Münzen (' + r.econ.coins + ')');
t(r.results[id].res.rank === 1, 'Lauf in der Rangliste (Aufrüstungen kamen vom Server, nicht vom Gerät)');
const coinsB = r.econ.coins;
r = await V(B, [{ id, t: 'run', ticket: tk, moves: g.inputs, score: sim.score }]);
t(r.econ.coins === coinsB, 'derselbe Lauf zählt nicht doppelt');
id = aid(); r = await V(B, [{ id, t: 'run', ticket: hex(12), moves: g.inputs, score: sim.score }]);
t(!r.results[id].ok && r.econ.coins === coinsB, 'Lauf mit erfundenem Ticket bringt nichts');
// Offline-Läufe: nachgerechnet, gedeckelt
const C2 = P(); await V(C2);
let off = 0; for (let k = 0; k < 25; k++) { const sd = 'eoff' + k, st = play(sd, 'endless', {}, .9, 60 * 60); id = aid(); r = await V(C2, [{ id, t: 'run', seed: sd, mode: 'endless', moves: st.inputs, score: st.score }]); if (r.results[id].ok) off++; }
t(off === E.OFFLINE.runs, 'Offline-Läufe pro Tag begrenzt (' + off + ')');
t(r.econ.tot.coins <= E.OFFLINE.coins, 'Offline-Münzen pro Tag gedeckelt (' + r.econ.tot.coins + ')');
id = aid(); r = await V(C2, [{ id, t: 'run', seed: 'exx', mode: 'endless', moves: [[5, 'L'], [3, 'R']], score: 99999 }]);
t(!r.results[id].ok, 'kaputte Eingaben abgelehnt');

// ---------- 4) Werbe-Belohnungen: nur im Rahmen ----------
id = aid(); const id2 = aid(); r = await V(B, [{ id, t: 'adDouble' }, { id: id2, t: 'adDouble' }]);
t(r.results[id].ok && !r.results[id2].ok, 'Münzen verdoppeln nur einmal pro Lauf');
const ids = [aid(), aid(), aid(), aid(), aid()]; r = await V(B, ids.map(x => ({ id: x, t: 'adFree' })));
t(ids.filter(x => r.results[x].ok).length === 3, 'Gratis-Münzen höchstens 3× am Tag');
id = aid(); r = await V(B, [{ id, t: 'streak', double: true }]); const id3 = aid(); const r2 = await V(B, [{ id: id3, t: 'streak' }]);
t(r.results[id].ok && !r2.results[id3].ok, 'Tagesbelohnung nur einmal am Tag');

// ---------- 5) Truhen: Zufall nur auf dem Server, nicht wiederholbar ----------
const D = P(); await V(D);
const give = (p, f) => { const e = __data.get('vault/' + p.uid); f(e.val.s); };   // Server-Stand direkt setzen (nur im Test)
give(D, s => { s.chests = ['legend', 'gold', 'silver']; });
id = aid(); r = await V(D, [{ id, t: 'chest' }]);
t(r.results[id].ok && r.results[id].res.loot.type === 'legend' && r.econ.chests.length === 2, 'Truhe auf dem Server geöffnet');
const lootA = r.results[id].res.loot;
r = await V(D, [{ id, t: 'chest' }]);
t(r.econ.chests.length === 2 && JSON.stringify(r.results[id].res.loot) === JSON.stringify(lootA), 'erneutes Senden öffnet nicht neu (gleiches Ergebnis, kein Neu-Würfeln)');
t(!JSON.stringify(r).includes(__data.get('vault/' + D.uid).val.rs), 'geheimer Zufallswert verlässt den Server nie');
id = aid(); r = await V(D, [{ id, t: 'chest', all: true }]);
t(r.results[id].ok && r.econ.chests.length === 0 && r.results[id].res.list.length === 2, 'alle Truhen öffnen');
id = aid(); r = await V(D, [{ id, t: 'chest' }]);
t(!r.results[id].ok, 'keine Truhe = nichts zu öffnen (auch wenn das Gerät eine meldet)');
id = aid(); r = await V(D, [{ id, t: 'spin' }]); const id4 = aid(); const r3 = await V(D, [{ id: id4, t: 'spin' }]);
t(r.results[id].ok && Number.isInteger(r.results[id].res.idx) && !r3.results[id4].ok, 'Glücksrad: Ergebnis vom Server, nur einmal gratis');

// ---------- 6) Käufe mit Guthaben, Echtgeld ----------
let jetLv = 0; give(D, s => { s.coins = 30000; jetLv = s.levels.jet; });
id = aid(); const ib = aid(), ic = aid(); r = await V(D, [{ id, t: 'buyChar', k: 'uni' }, { id: ib, t: 'upgrade', k: 'jet' }, { id: ic, t: 'buyStyle', cat: 'jet', k: 'phoenix' }]);
t(r.results[id].ok && r.results[ib].ok && r.econ.coins === 30000 - CHARS.uni.price - UPGRADE_COST[jetLv] - (r.results[ib].res.achs || []).length * 0 + [...(r.results[id].res.achs || []), ...(r.results[ib].res.achs || [])].reduce((a, x) => a + x.reward, 0), 'Kauf zieht genau den Preis ab');
t(!r.results[ic].ok, 'Saison-Teil nicht kaufbar');
const tx = 'GPA.' + hex(6);
id = aid(); r = await V(D, [{ id, t: 'iap', tx, pack: 'skyrush_coins_small' }]); const cAfter = r.econ.coins;
t(r.results[id].ok, 'Kauf ohne RevenueCat-Schlüssel übernommen (wird vermerkt)');
id = aid(); r = await V(D, [{ id, t: 'iap', tx, pack: 'skyrush_coins_huge' }]);
t(!r.results[id].ok && r.econ.coins === cAfter, 'dieselbe Transaktion nicht doppelt');
// Mit Schlüssel: nur, was RevenueCat bestätigt
process.env.REVENUECAT_SECRET = 'sk_test';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o) => { t(String(url).includes(D.uid) && o.headers.authorization === 'Bearer sk_test', 'RevenueCat-Abfrage'); return new Response(JSON.stringify({ subscriber: { non_subscriptions: { skyrush_coins_medium: [{ id: 'rc1', store_transaction_id: 'GPA.real1' }] } } })); };
id = aid(); r = await V(D, [{ id, t: 'iap', tx: 'GPA.fake', pack: 'skyrush_coins_huge' }]);
t(r.results[id].ok && r.econ.coins === cAfter + 6500 && r.econ.iapTx.includes('GPA.real1') && !r.econ.iapTx.includes('GPA.fake'), 'nur bestätigte Käufe zählen (erfundener Kauf wird ignoriert)');
globalThis.fetch = realFetch; delete process.env.REVENUECAT_SECRET;

// ---------- 7) Kopfstart & Aufrüstungen im Lauf-Ticket kommen aus dem Tresor ----------
give(D, s => { s.tokens.headstart = 0; s.levels = { jet: 1, magnet: 0, shield: 0, boots: 0 }; });
NOW += 5000; const sd = (await R(D, 'seed')).seed;
const bg = await R(D, 'begin', { id: hex(12), mode: 'endless', seed: sd, opts: { headstart: true, levels: { jet: 15, magnet: 15, shield: 15, boots: 15 } } });
t(bg.ok && !bg.opts.headstart && bg.opts.levels.jet === 1 && bg.opts.levels.boots === 0, 'Ticket nimmt Server-Werte (kein Kopfstart ohne Marke, keine falschen Stufen)');
give(D, s => { s.tokens.headstart = 1; });
NOW += 5000; const sd2 = (await R(D, 'seed')).seed;
const bg2 = await R(D, 'begin', { id: hex(12), mode: 'endless', seed: sd2, opts: { headstart: true } });
t(bg2.opts.headstart && __data.get('vault/' + D.uid).val.s.tokens.headstart === 0, 'Kopfstart-Marke wird beim Start auf dem Server verbraucht');

// ---------- 8) Duell: Prämie genau einmal, aus dem Server-Ergebnis ----------
const H1 = P(); await V(H1);
const cr = await post(duel, '/api/duel', { ...H1, action: 'create', rules: { ko: true } });
t(cr.ok && cr.room.rules.ko, 'eigener Raum mit K.O.-Regel');
await post(duel, '/api/duel', { ...H1, action: 'start', code: cr.room.code, fill: true });
NOW += 4100; const stt = await post(duel, '/api/duel', { ...H1, action: 'state', code: cr.room.code });
NOW += 1000;
const gd = C.createGame(stt.room.seed, 'duel', { ko: true }), th = makeBot(.5, 9);
while (!gd.over && gd.tick < 60 * 60 * 3) { const c = th(gd); if (c) C.input(gd, c); C.step(gd); gd.events.length = 0; }
NOW += gd.tick / 60 * 1000;
const fn = await post(duel, '/api/duel', { ...H1, action: 'finish', code: cr.room.code, inputs: gd.inputs, tick: gd.tick });
t(fn.ok, 'K.O.-Lauf ausgewertet');
const before = (await V(H1)).econ.coins;
id = aid(); r = await V(H1, [{ id, t: 'duel', kind: 'live', code: cr.room.code, place: 1, n: 4 }]);
const got = r.results[id];
t(got.ok && r.econ.coins > before, 'Duell-Prämie gutgeschrieben ' + JSON.stringify(got).slice(0, 200));
const lst = (await post(duel, '/api/duel', { ...H1, action: 'results', code: cr.room.code })).list;
t(got.res.place === lst.findIndex(x => x.u === H1.uid) + 1, 'Platz kommt vom Server (nicht vom Gerät): ' + got.res.place);
id = aid(); r = await V(H1, [{ id, t: 'duel', kind: 'live', code: cr.room.code, place: 1 }]);
t(!r.results[id].ok, 'Duell-Prämie nur einmal');

// ---------- 9) Reparatur: alter, zu hart gekürzter Spielstand (bis 2.0.0) bekommt Aurum/Platina & Münzen zurück ----------
const DAY = 86400000;
const legacy = async (p, name) => { await post(playerFn, '/api/player', { ...p, name }); __data.get('players/' + p.uid).val.created = NOW - 200 * DAY; };
const board = (u, h) => { const e = __data.get('boards/endless/all') || { val: { entries: [] }, etag: 'b0' }; e.val.entries = e.val.entries.filter(x => x.u !== u); e.val.entries.push({ u, n: 'x', c: null, s: h, h, at: NOW }); e.val.entries.sort((a, b) => b.s - a.s); __data.set('boards/endless/all', e); };
const L = P(); await legacy(L, 'Lena');
// so sah der Tresor nach der alten Übernahme aus
const oldS = E.ensure({ coins: 5000, bestH: 9999, milestone: 0, owned: ['hops'], levels: { jet: 3, magnet: 3, shield: 3, boots: 3 }, mult: 5 });
__data.set('vault/' + L.uid, { val: { s: oldS, rs: hex(16), rc: 0, rev: 3, created: NOW - 5 * DAY, notes: ['coins:52000', 'items:64000', 'lv', 'mult'] }, etag: 'v1' });
board(L.uid, 21450);
__data.set('ac/r/endless/all/' + L.uid, { val: { h: 21450, opts: { levels: { jet: 6, magnet: 6, shield: 5, boots: 5 }, mult: 14 } }, etag: 'r1' });
r = await V(L, [], { wear: { char: 'uni', style: { jet: 'bubble', hat: 'none' } } });
const rs = r.restored;
t(rs && r.econ.bestH === 21450 && r.econ.owned.includes('aurum') && r.econ.owned.includes('platina') && !r.econ.owned.includes('kristallo'), 'Rekord aus der Rangliste zurück → Aurum + Platina frei: ' + JSON.stringify(rs));
t(r.econ.milestone === 2, 'Tore gelten als erreicht (keine doppelte Belohnung)');
t(r.econ.owned.includes('uni') && r.econ.ownedStyle.includes('jet:bubble'), 'getragene Figur/Ausrüstung direkt zurück');
const refund = 47000 + 64000 - CHARS.uni.price - STYLE.jet.items.bubble.price;
t(rs.coins === refund && r.econ.coins === 5000 + refund, 'gekürzte Münzen + Rest der Sammlung als Münzen: ' + rs.coins + ' (erwartet ' + refund + ')');
t(r.econ.levels.jet === 6 && r.econ.levels.boots === 5 && r.econ.mult === 14, 'Aufrüstungen/Multiplikator wie beim belegten Spitzenlauf: ' + JSON.stringify(r.econ.levels) + ' ×' + r.econ.mult);
const flg = (__data.get('ac/flags')?.val.list || []).find(f => f.u === L.uid);
t(flg && String(flg.why).startsWith('restored:'), 'im Admin-Bereich vermerkt: ' + (flg && flg.why));
r = await V(L, [], { wear: { char: 'robo' } });
t(!r.restored && r.econ.coins === 5000 + refund && !r.econ.owned.includes('robo'), 'Reparatur nur einmal');
// Ohne Beleg: Rekord bleibt, Figuren nur per Admin
const N2 = P(); await legacy(N2, 'Tom');
__data.set('vault/' + N2.uid, { val: { s: E.ensure({ coins: 5000, bestH: 9999 }), rs: hex(16), rc: 0, rev: 1, created: NOW - 5 * DAY, notes: [] }, etag: 'v2' });
r = await V(N2);
t(!r.restored && !r.econ.owned.includes('aurum'), 'ohne Beleg keine Höhen-Figur');
process.env.ADMIN_TOKEN = 'adm-0123456789abcdefghijklmnop'; process.env.ADMIN_FAIL_DELAY = '0';
const adReq = async (body, hdr = {}, method = 'POST', qs = '') => { const q = await admin(new Request('http://x/api/admin' + qs, { method, headers: { 'x-forwarded-for': '10.1.1.1', ...hdr }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })); return { status: q.status, ...(await q.json()) }; };
let SESS = (await adReq({ action: 'login', key: process.env.ADMIN_TOKEN })).token;
const ad = async body => adReq(body, { authorization: 'Bearer ' + SESS });
const adGet = async qs => adReq(null, { authorization: 'Bearer ' + SESS }, 'GET', qs);
const ah = await ad({ action: 'height', uid: N2.uid, h: 12345 });
t(ah.ok && ah.chars.includes('aurum'), 'Admin bestätigt Rekord → Aurum frei');
r = await V(N2);
t(r.restored && r.restored.chars.includes('aurum') && r.econ.bestH === 12345 && r.econ.owned.includes('aurum'), 'Gerät erfährt es beim nächsten Abgleich');
t(!(await V(N2)).restored, 'Hinweis nur einmal');
// Betrug mit frischem Konto (Gerät vorher manipuliert): kein Rahmen, keine Erstattung
const F = P();
r = await V(F, [], { init: { coins: 80000, bestH: 30000, owned: ['hops', 'aurum', 'platina'] } });
t(r.econ.coins <= 5000 && !r.econ.owned.includes('aurum') && r.econ.bestH <= 9999, 'frisches Konto: erfundener Rekord/Münzen bringen nichts');

// ---------- 10) Übernahme mit Beleg (alter Spieler, Gerät bisher ohne Tresor) ----------
const O = P(); await legacy(O, 'Oma'); board(O.uid, 15800);
r = await V(O, [], { init: { coins: 64000, bestH: 15800, owned: ['hops', 'kiki', 'aurum'], ownedStyle: ['jet:bubble'], levels: { jet: 6, magnet: 5, shield: 4, boots: 4 }, mult: 11, milestone: 1 } });
t(r.econ.owned.includes('aurum') && r.econ.bestH === 15800 && r.econ.coins === 64000 && r.econ.owned.includes('kiki') && r.econ.levels.jet === 6 && r.econ.mult === 11, 'belegter Langzeit-Spieler behält alles: ' + r.econ.coins + ' ' + r.econ.owned.join(','));
t(!r.restored, 'neue Übernahme braucht keine Reparatur');
const O2 = P(); await legacy(O2, 'Opa');
r = await V(O2, [], { init: { coins: 64000, bestH: 15800, owned: ['hops', 'aurum'] } });
t(r.econ.bestH === 9999 && !r.econ.owned.includes('aurum') && r.econ.coins === 20000, 'ohne Beleg: Rekord ≤ 9.999 m, Münzen im Grundrahmen: ' + r.econ.coins);

// ---------- 11) Gadget-Stufen aus der Übernahme kommen zurück (Reparatur 3), nachgekaufte werden erstattet ----------
const POW = ['jet', 'magnet', 'shield', 'boots'];
const lvCost = lv => POW.reduce((a, k) => a + UPGRADE_COST.slice(0, lv[k]).reduce((x, y) => x + y, 0), 0);
const G1 = P(); await legacy(G1, 'Gadget'); board(G1.uid, 8000);
const trimmed = { jet: 4, magnet: 3, shield: 3, boots: 2 };   // so kam der Stand nach der Übernahme an (vorher 8.7.6.6)
const g1s = E.ensure({ coins: 1000, bestH: 8000, levels: { ...trimmed, jet: 6 } });   // danach Jetpack selbst wieder von 4 auf 6 gekauft
__data.set('vault/' + G1.uid, { val: { s: g1s, rs: hex(16), rc: 0, rev: 4, created: NOW - 9 * DAY, notes: ['lv:8.7.6.6'], fix: 2 }, etag: 'g1' });
r = await V(G1);
t(r.restored && r.econ.levels.jet === 8 && r.econ.levels.magnet === 7 && r.econ.levels.shield === 6 && r.econ.levels.boots === 6, 'Stufen wie vor der Übernahme zurück: ' + JSON.stringify(r.econ.levels));
t(r.restored && r.restored.lv && r.restored.lvCoins > 0 && r.econ.coins === 1000 + r.restored.lvCoins, 'nachgekaufte Stufen erstattet: ' + (r.restored && r.restored.lvCoins));
t(r.restored.lvCoins <= UPGRADE_COST[4] + UPGRADE_COST[5], 'Erstattung nicht mehr als nachgekauft (Stufe 5+6): ' + r.restored.lvCoins);
t(!(await V(G1)).restored, 'Stufen-Reparatur nur einmal');
// alter Vermerk ohne Werte: Erfolg „Tüftler II“ belegt ≥ 25 Stufen
const G2 = P(); await legacy(G2, 'Alt'); board(G2.uid, 6000);
const g2s = E.ensure({ coins: 0, bestH: 6000, levels: { jet: 3, magnet: 3, shield: 3, boots: 3 }, ach: { upg0: true, upg1: true } });
__data.set('vault/' + G2.uid, { val: { s: g2s, rs: hex(16), rc: 0, rev: 2, created: NOW - 30 * DAY, notes: ['coins:9000', 'lv'], fix: 2 }, etag: 'g2' });
r = await V(G2);
t(POW.reduce((a, k) => a + r.econ.levels[k], 0) >= 25 && Math.max(...POW.map(k => r.econ.levels[k])) - Math.min(...POW.map(k => r.econ.levels[k])) <= 1, 'alter Vermerk: Stufen nach „Tüftler“ zurück: ' + JSON.stringify(r.econ.levels));
// Rahmen: „alles auf 15“ ohne Beleg gibt es nicht
const G3 = P(); await legacy(G3, 'Fake');
__data.set('vault/' + G3.uid, { val: { s: E.ensure({ coins: 0, levels: { jet: 2, magnet: 2, shield: 2, boots: 2 } }), rs: hex(16), rc: 0, rev: 2, created: NOW - 30 * DAY, notes: ['lv:15.15.15.15'], fix: 2 }, etag: 'g3' });
r = await V(G3);
t(lvCost(r.econ.levels) <= E.levelCap(0) && r.econ.levels.jet >= 2 && (r.restored?.lvCoins || 0) === 0, 'ohne Beleg nur im Rahmen: ' + JSON.stringify(r.econ.levels));
// frisches Konto: nichts
const G4 = P(); await post(playerFn, '/api/player', { ...G4, name: 'Neu' });
__data.set('vault/' + G4.uid, { val: { s: E.ensure({ levels: { jet: 1, magnet: 0, shield: 0, boots: 0 } }), rs: hex(16), rc: 0, rev: 1, created: NOW, notes: ['lv:9.9.9.9'], fix: 2 }, etag: 'g4' });
r = await V(G4);
t(!r.restored && r.econ.levels.jet === 1, 'frisches Konto bekommt keine Stufen geschenkt');
// Admin gibt Stufen von Hand zurück
const al = await ad({ action: 'levels', uid: G4.uid, levels: { jet: 7, magnet: 7, shield: 0, boots: 5 }, coins: 1234 });
r = await V(G4);
t(al.ok && r.econ.levels.jet === 7 && r.econ.levels.boots === 5 && r.restored && r.restored.lv && r.restored.lvCoins === 1234, 'Admin: Stufen + Erstattung kommen beim nächsten Abgleich an');

// ---------- 12) Tages-Run: Auswertung erst nach Tagesende, nach Platzierung ----------
const MD = await import('../www/meta.js');
const D1 = P(); await V(D1);
const dk = C.dayKey(new Date(NOW)), dseed = 'daily-' + dk;
let tk1 = hex(12); t((await R(D1, 'begin', { id: tk1, mode: 'daily' })).ok, 'Tages-Run gestartet');
let dg = play(dseed, 'daily', {}, .7), ds = C.simulate(dseed, 'daily', dg.inputs, {});
NOW += ds.ticks / 60 * 1000 + 1500;
const c0 = (await V(D1)).econ;
id = aid(); r = await V(D1, [{ id, t: 'run', ticket: tk1, moves: dg.inputs, score: ds.score }]);
t(r.results[id].ok && r.results[id].res.rank === 1 && !r.dailies && r.econ.chests.length === c0.chests.length && !r.econ.dwins.length, 'Tages-Run gewertet, aber noch nichts ausgezahlt');
// 40 weitere Teilnehmer (einer gesperrt) → Platz 2, 3, Top 10 % (Platz 4) und „dabei“
const DP = Array.from({ length: 40 }, () => P());
for (const p of DP) await V(p);
const db = __data.get('boards/daily/' + dk).val;
DP.forEach((p, i) => db.entries.push({ u: p.uid, n: 'D' + i, c: null, s: Math.max(1, ds.score - 10 - i), h: 100, at: NOW }));
db.entries.sort((a, b) => b.s - a.s);
__data.set('ac/bans', { val: { [DP[0].uid]: { why: 'test', at: NOW } }, etag: 'bd' });
t(!(await V(D1)).dailies, 'vor Tagesende keine Auswertung');
NOW = MD.dayEnd(new Date(NOW)) + 10 * 60e3;
t(!(await V(D1)).dailies, 'kurz nach Mitternacht: noch Prüfzeit');
NOW = MD.dayEnd(new Date(NOW - 864e5)) + MD.DAILY_SETTLE + 60e3;
const dBefore = __data.get('vault/' + D1.uid).val.s.coins;
r = await V(D1);
t(r.dailies && r.dailies[0].r === 1 && r.dailies[0].tier === 'p1' && r.econ.chests[0] === 'gold' && r.econ.coins === dBefore + 500 && r.econ.dwins[0].seen === false && r.econ.dwins[0].n === 40, 'Tagessieger: Gold-Truhe + 500 Münzen (Platz 1 von 40)');
t(!(await V(D1)).dailies, 'Auswertung nur einmal');
r = await V(DP[1]); t(r.dailies && r.dailies[0].r === 2 && r.dailies[0].tier === 'p2' && r.econ.chests[0] === 'silver', 'Platz 2 (Gesperrter zählt nicht)');
r = await V(DP[3]); t(r.dailies && r.dailies[0].r === 4 && r.dailies[0].tier === 'top', 'Top 10 %');
r = await V(DP[4]); t(r.dailies && r.dailies[0].tier === 'all' && r.econ.chests[0] === 'bronze' && r.dailies[0].coins === 100, 'dabei gewesen: Bronze-Truhe + 100');
r = await V(DP[0]); t(!r.dailies, 'gesperrt: nichts');
id = aid(); r = await V(D1, [{ id, t: 'dailySeen', d: dk }]); t(r.results[id].ok && r.econ.dwins[0].seen, 'Auswertung als gesehen markiert');
// Umstellungstag: wer schon die alte Sofort-Belohnung hatte, bekommt nur für Top-Plätze noch etwas
const D2 = P(); await V(D2); const D3 = P(); await V(D3);
const dk2 = C.dayKey(new Date(NOW));
__data.set('boards/daily/' + dk2, { val: { entries: [D2, ...DP.slice(5, 45), D3].map((p, i) => ({ u: p.uid, n: 'x', c: null, s: 1000 - i, h: 10, at: NOW })) }, etag: 'd2' });
for (const p of [D2, D3]) __data.get('vault/' + p.uid).val.s.dprize = dk2;
NOW = MD.dayEnd(new Date(NOW)) + MD.DAILY_SETTLE + 60e3;
t((await V(D2)).dailies?.[0].tier === 'p1' && !(await V(D3)).dailies, 'Umstellungstag: keine doppelte Teilnahme-Belohnung');

// ---------- 13) Wochenturnier: Preise für Platz 1–3 nach Wochenende ----------
const M = await import('../www/meta.js');
const wk = C.weekKey(new Date(NOW));
const T = [P(), P(), P(), P(), P()];
for (const [i, p] of T.entries()) { await post(playerFn, '/api/player', { ...p, name: 'T' + i }); await V(p); }
// Platz 1 ist ein Betrüger (gesperrt) → die anderen rücken auf
__data.set('boards/tournament/' + wk, { val: { entries: T.map((p, i) => ({ u: p.uid, n: 'T' + i, c: null, s: 9000 - i * 1000, h: 900 - i * 100, at: NOW })) }, etag: 'tb' });
__data.set('ac/bans', { val: { [T[0].uid]: { why: 'test', at: NOW } }, etag: 'bn' });
r = await V(T[1]);
t(!(r.prizes || []).length, 'während der Woche noch kein Preis');
NOW = M.tourEnd(new Date(NOW)) + 2 * 3600e3;
r = await V(T[1]);
t(!(r.prizes || []).length, 'direkt nach Wochenende noch Prüfzeit');
NOW = M.tourEnd(new Date(NOW - 7 * DAY)) + M.TOUR_SETTLE + 60e3;
const before1 = (await __data.get('vault/' + T[1].uid)).val.s;
r = await V(T[1]);
const w1 = r.econ.trophies.wins[0];
t(r.prizes && r.prizes[0].pl === 1 && w1 && w1.p === wk && w1.pl === 1 && r.econ.trophies.g === 1, 'Platz 1 (Betrüger davor zählt nicht): Preis gutgeschrieben');
t(r.econ.coins === before1.coins + M.TOUR_PRIZES[0].coins && r.econ.chests.includes('legend') && r.econ.ownedStyle.includes('hat:laurel'), 'Siegerpreis: Münzen, Legendäre Truhe, Siegerkranz');
t(!(await V(T[1])).prizes, 'Preis nur einmal');
r = await V(T[2]); t(r.prizes && r.prizes[0].pl === 2 && r.econ.chests.includes('epic') && !r.econ.ownedStyle.includes('hat:laurel'), 'Platz 2: Epische Truhe');
r = await V(T[3]); t(r.prizes && r.prizes[0].pl === 3 && r.econ.chests.includes('gold'), 'Platz 3: Gold-Truhe');
r = await V(T[4]); t(!r.prizes && r.econ.trophies.b === 0, 'Platz 4: kein Preis');
r = await V(T[0]); t(!r.prizes, 'gesperrter Spieler bekommt nichts');
id = aid(); r = await V(T[1], [{ id, t: 'tourSeen', p: wk }]);
t(r.results[id].ok && r.econ.trophies.wins[0].seen === true && r.econ.trophies.g === 1, 'Siegerehrung als gesehen markiert');
id = aid(); r = await V(T[4], [{ id, t: 'tourGrant', place: 1, p: wk }]);
t(!r.results[id].ok && r.econ.trophies.g === 0, 'Gerät kann sich keinen Turnierpreis selbst geben');
id = aid(); r = await V(T[4], [{ id, t: 'buyStyle', cat: 'hat', k: 'laurel' }]);
t(!r.results[id].ok && !r.econ.ownedStyle.includes('hat:laurel'), 'Siegerkranz nicht kaufbar');
const FK = P(); r = await V(FK, [], { init: { trophies: { g: 9, s: 0, b: 0, wins: [] }, ownedStyle: ['hat:laurel'] } });
t(r.econ.trophies.g === 0 && !r.econ.ownedStyle.includes('hat:laurel'), 'Pokale/Siegerkranz lassen sich nicht vom Gerät übernehmen');

// ---------- 14) Zentrale: Anmeldung, Sperre nach 3 Fehlversuchen, Sitzungen ----------
const AK = process.env.ADMIN_TOKEN;
SESS = (await adReq({ action: 'login', key: AK }, { 'x-forwarded-for': '10.1.1.2' })).token;
let x = await adReq({ action: 'login', key: 'falsch' }, { 'x-forwarded-for': '7.7.7.7' });
t(x.status === 401 && x.left === 2, 'falscher Schlüssel: noch 2 Versuche');
x = await adReq({ action: 'login', key: 'falsch2' }, { 'x-forwarded-for': '7.7.7.7' }); t(x.left === 1, 'noch 1 Versuch');
x = await adReq({ action: 'login', key: 'falsch3' }, { 'x-forwarded-for': '7.7.7.7' }); t(x.status === 423 && x.until > NOW, 'nach 3 Fehlversuchen gesperrt');
x = await adReq({ action: 'login', key: AK }, { 'x-forwarded-for': '7.7.7.7' }); t(x.status === 423 && !x.token, 'gesperrt: selbst der richtige Schlüssel geht nicht');
x = await adReq({ action: 'login', key: AK }, { 'x-forwarded-for': '8.8.8.8' }); t(x.status === 200 && x.token, 'anderer Anschluss kann sich anmelden');
NOW += 3600e3 + 1000;
x = await adReq({ action: 'login', key: AK }, { 'x-forwarded-for': '7.7.7.7' }); t(x.status === 200, 'nach 1 Stunde wieder frei');
for (let k = 0; k < 3; k++) x = await adReq({ action: 'login', key: 'nö' + k }, { 'x-forwarded-for': '6.6.6.6' });
t(x.status === 423 && x.until - NOW < 2 * 3600e3, 'erste Sperre: 1 Stunde');
NOW += 3600e3 + 1000;
for (let k = 0; k < 3; k++) x = await adReq({ action: 'login', key: 'nö' + k }, { 'x-forwarded-for': '6.6.6.6' });
t(x.status === 423 && x.until - NOW > 20 * 3600e3, 'zweite Sperre: 24 Stunden');
SESS = (await adReq({ action: 'login', key: AK }, { 'x-forwarded-for': '10.1.1.3' })).token;
for (let k = 0; k < 2; k++) await adReq({ action: 'login', key: 'y' + k }, { 'x-forwarded-for': '9.9.8.' + k });
for (let k = 0; k < 7; k++) x = await adReq({ action: 'login', key: 'x' + k }, { 'x-forwarded-for': '9.9.9.' + k });
x = await adReq({ action: 'login', key: AK }, { 'x-forwarded-for': '5.5.5.5' });
t(x.status === 423 && x.all, '10 Fehlversuche insgesamt: Anmeldung für alle gesperrt');
t((await ad({ action: 'unboard', uid: T[4].uid })).ok, 'bestehende Sitzung läuft weiter');
process.env.ADMIN_TOKEN = 'neu-0123456789abcdefghijklmnopqrs';
t((await ad({ action: 'unboard', uid: T[4].uid })).status === 401, 'neuer Schlüssel: alte Sitzungen ungültig');
x = await adReq({ action: 'login', key: process.env.ADMIN_TOKEN }, { 'x-forwarded-for': '7.7.7.7' });
t(x.status === 200, 'neuer Schlüssel hebt die Sperren auf'); SESS = x.token;
const sec = await adGet('?view=security');
t(sec.sessions.length >= 1 && sec.keyLength >= 24, 'Sicherheits-Übersicht');
process.env.ADMIN_TOKEN = 'kurz';
t((await adReq({ action: 'login', key: 'kurz' })).status === 503, 'zu kurzer Schlüssel wird nicht akzeptiert');
process.env.ADMIN_TOKEN = 'neu-0123456789abcdefghijklmnopqrs';

// ---------- 15) Zentrale: Spieler auflisten, hoch- und runterstufen ----------
const pl = await adGet('?view=players');
t(pl.players.length >= 5 && pl.players.some(e => e.u === T[1].uid && e.t[0] === 1), 'Spielerliste aus dem Verzeichnis (mit Pokalen): ' + pl.players.length);
let ri = { next: 0 }; while (ri.next !== null) ri = await ad({ action: 'reindex', offset: ri.next });
t(ri.total >= 10 && (await adGet('?view=players')).players.length >= ri.total, 'Verzeichnis neu aufbauen: ' + ri.total);
const pv = await adGet('?view=player&uid=' + T[1].uid);
t(pv.vault && pv.vault.s.trophies.g === 1 && pv.ranks.length === 4 && pv.player.name, 'Spieler-Ansicht');
const U = T[1], cBefore = (await V(U)).econ.coins;
x = await ad({ action: 'op', uid: U.uid, op: { kind: 'coins', mode: 'sub', n: 1000 }, why: 'Test' });
r = await V(U); t(x.ok && r.econ.coins === cBefore - 1000, 'Münzen abziehen: ' + x.msg);
x = await ad({ action: 'op', uid: U.uid, op: { kind: 'levels', lv: { jet: 2, magnet: 0, shield: 0, boots: 1 } } });
r = await V(U); t(r.econ.levels.jet === 2 && r.econ.levels.boots === 1, 'Stufen herabsetzen');
x = await ad({ action: 'op', uid: U.uid, op: { kind: 'prizeDel', p: wk, revoke: true }, why: 'falsch vergeben' });
r = await V(U); t(x.ok && r.econ.trophies.g === 0 && !r.econ.ownedStyle.includes('hat:laurel') && !r.econ.chests.includes('legend'), 'Turnierpreis zurückgenommen: ' + x.msg);
r = await V(U); t(!r.prizes, 'zurückgenommener Preis wird nicht automatisch neu ausgezahlt');
x = await ad({ action: 'op', uid: U.uid, op: { kind: 'prize', p: wk, pl: 1 }, why: 'nachgereicht' });
r = await V(U); t(x.ok && r.econ.trophies.g === 1 && r.econ.chests[0] === 'legend' && r.econ.ownedStyle.includes('hat:laurel') && r.econ.trophies.wins[0].seen === false, 'Turnierpreis von Hand nachgereicht (Truhe vorne)');
t((await ad({ action: 'op', uid: U.uid, op: { kind: 'prize', p: wk, pl: 1 } })).status === 400, 'kein doppelter Preis für dieselbe Woche');
x = await ad({ action: 'op', uid: U.uid, op: { kind: 'chestDel', type: 'legend' } }); r = await V(U); t(!r.econ.chests.includes('legend'), 'Truhe entfernen');
x = await ad({ action: 'op', uid: U.uid, op: { kind: 'charAdd', k: 'aurum' } }); r = await V(U); t(r.econ.owned.includes('aurum'), 'Figur geben');
x = await ad({ action: 'op', uid: U.uid, op: { kind: 'charDel', k: 'aurum' } }); r = await V(U); t(!r.econ.owned.includes('aurum'), 'Figur wegnehmen (bleibt weg): ' + r.econ.bestH);
x = await ad({ action: 'op', uid: U.uid, op: { kind: 'height', h: 25000 } }); r = await V(U); t(r.econ.owned.includes('aurum') && r.econ.owned.includes('platina'), 'Rekord hoch → Höhen-Figuren');
x = await ad({ action: 'op', uid: U.uid, op: { kind: 'height', h: 900 } }); r = await V(U); t(r.econ.bestH === 900 && !r.econ.owned.includes('aurum') && !r.econ.owned.includes('platina'), 'Rekord runter → Höhen-Figuren weg');
// Abgleich überschreibt den Tresor gleichzeitig → Auftrag wird beim nächsten Abgleich nachgeholt (genau einmal)
const snap = structuredClone(__data.get('vault/' + U.uid).val), c1 = snap.s.coins;
x = await ad({ action: 'op', uid: U.uid, op: { kind: 'coins', mode: 'add', n: 777 } });
__data.set('vault/' + U.uid, { val: snap, etag: 'clob' });
r = await V(U); t(r.econ.coins === c1 + 777, 'überschriebene Änderung wird nachgeholt');
r = await V(U); t(r.econ.coins === c1 + 777, '… und nur einmal');
x = await ad({ action: 'op', uid: U.uid, op: { kind: 'reset' } }); r = await V(U);
t(r.econ.coins === 0 && r.econ.trophies.g === 0 && r.econ.owned.length === 1, 'Spielstand zurücksetzen');
t((await ad({ action: 'op', uid: U.uid, op: { kind: 'erfunden' } })).status === 400, 'unbekannte Änderung abgelehnt');
x = await ad({ action: 'rename', uid: U.uid, name: 'Neuer Name' }); t(x.ok && (await adGet('?view=player&uid=' + U.uid)).player.name === 'Neuer Name', 'Spieler umbenennen');
const lg = await adGet('?view=log');
t(lg.log.some(l => l.a === 'op:prizeDel' && /falsch vergeben/.test(l.d)) && lg.log.some(l => l.a === 'login-fail'), 'Protokoll mit Grund und Fehlversuchen');
t((await ad({ action: 'logoutAll' })).ok && (await adGet('?view=log')).status === 401, 'alle abmelden');

// ---------- Shop aus der Zentrale: Preise, Rabatt, ausblenden – Server rechnet genauso ----------
{
  SESS = (await adReq({ action: 'login', key: process.env.ADMIN_TOKEN }, { 'x-forwarded-for': '7.7.7.7' })).token;
  const sv = await adGet('?view=shop');
  t(sv.items && sv.items.some(x => x.id === 'char:pingo' && x.base === 9000) && !sv.items.some(x => x.id === 'char:aurum') && !sv.items.some(x => x.id === 'jet:phoenix'), 'Shop-Liste: käufliche Artikel, keine Höhen-/Saison-Belohnungen');
  const bad1 = await ad({ action: 'shop', shop: { items: { 'char:pingo': { price: 5 } }, sale: { pct: 95 } } });
  t(bad1.status === 400 && bad1.fields.includes('Preis char:pingo') && bad1.fields.includes('Shop-Rabatt'), 'ungültige Shop-Werte abgelehnt');
  const bad2 = await ad({ action: 'shop', shop: { sale: { pct: 20, from: NOW + 5000, until: NOW } } });
  t(bad2.status === 400 && bad2.fields.includes('Rabatt-Zeitraum'), 'Enddatum vor Start abgelehnt');
  const sOk = await ad({ action: 'shop', shop: { items: { 'char:pingo': { price: 4000 }, 'char:ninja': { hidden: true }, 'jet:retro': { sale: 50 }, 'char:fake': { price: 10 } }, packs: { skyrush_coins_huge: { tag: '<b>Top</b>' } }, sale: { pct: 0 } } });
  t(sOk.ok && !sOk.shop.items['char:fake'] && sOk.shop.packs.skyrush_coins_huge.tag === 'bTop/b', 'Shop gespeichert, Unbekanntes verworfen, Etikett bereinigt');
  const S1 = P(); let q = await V(S1, [], { init: { coins: 5000 } });
  const c0 = q.econ.coins;
  let i1 = aid(), i2 = aid(), i3 = aid();
  q = await V(S1, [{ id: i1, t: 'buyChar', k: 'pingo' }, { id: i2, t: 'buyChar', k: 'ninja' }, { id: i3, t: 'buyStyle', cat: 'jet', k: 'retro' }]);
  t(q.econ.owned.includes('pingo') && !q.econ.owned.includes('ninja') && q.econ.ownedStyle.includes('jet:retro') && q.econ.coins === c0 - 4000 - 750, 'Server: neuer Preis, Rabatt 50 %, ausgeblendet nicht kaufbar');
  // Rabattaktion mit Zeitraum
  await ad({ action: 'shop', shop: { sale: { pct: 20, from: NOW - 1000, until: NOW + 3600e3 } } });
  const S2 = P(); q = await V(S2, [], { init: { coins: 5000 } }); const c2 = q.econ.coins;
  i1 = aid(); q = await V(S2, [{ id: i1, t: 'buyStyle', cat: 'jet', k: 'cyber' }]);
  t(q.econ.coins === c2 - 4400, 'Rabattaktion −20 % gilt serverseitig');
  NOW += 3601e3;
  const S3 = P(); q = await V(S3, [], { init: { coins: 5000 } }); const c3 = q.econ.coins;
  i1 = aid(); q = await V(S3, [{ id: i1, t: 'buyStyle', cat: 'jet', k: 'bubble' }]);
  t(q.econ.coins === c3 - 3000, 'nach Ablauf wieder Normalpreis');
  const pub = await (await (await import('../netlify/functions/config.mjs').catch(() => ({ default: null }))).default?.(new Request('http://x/api/config')))?.json?.().catch(() => null);
  if (pub) t(pub.shop && pub.shop.sale && pub.shop.sale.pct === 20, 'öffentliche Konfiguration enthält Shop');
  t((await ad({ action: 'shop', shop: {} })).ok, 'Shop zurücksetzen');
  const { applyShop } = await import('../www/shopcfg.js'); applyShop({});
  t(CHARS.pingo.price === 9000 && !CHARS.ninja.hidden && STYLE.jet.items.retro.price === 1500, 'Standardpreise wiederhergestellt');
}

console.log(bad ? `Tresor: ${bad} FEHLER, ${ok} ok` : `Tresor: alle ${ok} Prüfungen ok`);
process.exit(bad ? 1 : 0);
