// Test des Duell-Servers mit simulierten Spielern (Speicher im Arbeitsspeicher statt Netlify Blobs, Uhr gesteuert).
// Aufruf: npm run test:duel
import duel from '../netlify/functions/duel.mjs';
import { __data } from './mock/blobs.mjs';
import { makeBot, runBot } from '../www/bot.js';
import * as C from '../www/core.js';

let ok = 0, bad = 0;
const t = (c, m) => { if (c) ok++; else { bad++; console.log('✖', m); } };
let NOW = Date.now(); const realNow = Date.now; Date.now = () => NOW;
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const P = () => ({ uid: crypto.randomUUID(), secret: hex(20) });
const call = async (p, action, body = {}) => {
  const r = await duel(new Request('http://x/api/duel', { method: 'POST', body: JSON.stringify({ uid: p.uid, secret: p.secret, action, char: 'kiki', style: { jet: 'gold', trail: 'hearts', shoe: 'neon' }, best: 300, ...body }) }));
  return { status: r.status, ...(await r.json()) };
};
// Ein Rennen wie im Client: alle „Sekunde“ 60 Ticks rechnen, dann abgleichen
async function race(code, seed, R) {
  for (let sec = 0; sec < 120 && R.some(r => !r.st.over); sec++) {
    NOW += 1000;
    for (const r of R) {
      for (let k = 0; k < 60 && !r.st.over; k++) { const c = r.think(r.st); if (c) C.input(r.st, c); C.step(r.st); r.st.events.length = 0; }
      const add = r.st.inputs.slice(r.sent), from = r.sent;
      const have = Object.fromEntries(Object.entries(r.got).map(([u, v]) => [u, v.length]));
      const s = await call(r.p, 'sync', { code, from, inputs: add, tick: r.st.tick, h: Math.floor(r.st.maxY / 10), have });
      if (!s.ok) { t(false, 'sync: ' + s.error); continue; }
      r.sent = s.mine;
      for (const o of s.others) { r.got[o.u] ??= []; if (o.from === r.got[o.u].length) r.got[o.u].push(...o.inputs); }
    }
  }
  for (const r of R) {   // letzter Abgleich
    const have = Object.fromEntries(Object.entries(r.got).map(([u, v]) => [u, v.length]));
    const s = await call(r.p, 'sync', { code, from: r.sent, inputs: [], tick: r.st.tick, h: Math.floor(r.st.maxY / 10), have });
    for (const o of s.others) { r.got[o.u] ??= []; if (o.from === r.got[o.u].length) r.got[o.u].push(...o.inputs); }
  }
}
const A = P(), B = P(), Cc = P(), D = P(), E = P();

// ---------- 1) Schnellsuche: sofort ein Raum, Start in 6 s, Aufstellung wird aufgefüllt ----------
const a = await call(A, 'quick');
t(a.ok && a.room.players.length === 1 && a.room.startAt - a.now === 6000 && /^duel-\d{4}-\d\d-\d\d-\d$/.test(a.room.seed), 'A: Raum mit Start in 6 s auf einer Tagesstrecke');
NOW += 1500;
const b = await call(B, 'quick');
t(b.ok && b.room.code === a.room.code && b.room.players.length === 2, 'B landet im selben Raum');
const code = a.room.code, seed = a.room.seed;
let st = await call(A, 'state', { code });
t(!st.room.locked, 'Aufstellung vor dem Start noch offen');
NOW = a.room.startAt - 1200;
st = await call(B, 'state', { code });
t(st.room.locked && st.room.fill.length === 2 && st.room.fill.every(f => f.kind === 'bot'), `Aufstellung fest: 2 Menschen + ${st.room.fill.length} Bots`);
const st2 = await call(A, 'state', { code });
t(JSON.stringify(st2.room.fill) === JSON.stringify(st.room.fill), 'alle sehen dieselbe Aufstellung');
for (const f of st.room.fill) t(Math.floor(runBot(seed, f.skill, undefined, f.bseed).maxY / 10) === f.h, `Bot ${f.n} rechnet überall gleich (${f.h} m)`);
t((await call(Cc, 'join', { code })).status === 409, 'feste Aufstellung: kein Beitritt mehr');
const c3 = await call(Cc, 'quick');
t(c3.room.code !== code, 'neue Schnellsuche öffnet nach dem Festschreiben einen neuen Raum');

// ---------- 2) Rennen ----------
NOW = a.room.startAt;
const R = [A, B].map((p, i) => ({ p, st: C.createGame(seed, 'duel'), think: makeBot(.3 + i * .4, 21 + i), sent: 0, got: {} }));
await race(code, seed, R);
t(R.every(r => r.st.over && r.st.cause === 'time'), 'beide Rennen enden nach 90 s');
for (const r of R) for (const o of R) if (o !== r) {
  const sim = C.simulate(seed, 'duel', r.got[o.p.uid] || []);
  t(sim.ok && sim.height === Math.floor(o.st.maxY / 10), `Gegner wird exakt nachgerechnet (${sim.height} m)`);
}
// verlorene Antwort: überlappendes Paket hängt nichts doppelt an
const dup = await call(A, 'sync', { code, from: 0, inputs: R[0].st.inputs.slice(0, 4), tick: R[0].st.tick, h: 1 });
t(dup.ok && dup.mine === R[0].st.inputs.length, 'überlappendes Paket wird sauber zusammengeführt');

// ---------- 3) Ende ----------
let fin = await call(A, 'finish', { code, inputs: R[0].st.inputs });
if (!fin.ok || fin.all) console.log('DIAG finish A', fin.status, fin.error, fin.all, JSON.stringify(fin.list?.map(x => [x.kind, x.h, x.done, x.left])));
t(fin.ok && !fin.all && fin.list.length === 4, 'nach A: Endstand mit 4 Plätzen, B fehlt noch');
fin = await call(B, 'finish', { code, inputs: R[1].st.inputs });
t(fin.ok && fin.all, 'nach B: alle fertig');
const exp = [...R.map(r => Math.floor(r.st.maxY / 10)), ...st.room.fill.map(f => f.h)].sort((x, y) => y - x);
t(JSON.stringify(fin.list.map(x => x.h)) === JSON.stringify(exp), 'Rangfolge = echte Höhen inkl. Bots');
t((await call(B, 'finish', { code, inputs: [[5, 'X']] })).status === 422, 'ungültige Eingaben werden abgelehnt');
t((await call(B, 'finish', { code, inputs: [[50, 'L'], [10, 'R']] })).status === 422, 'Eingaben in falscher Reihenfolge werden abgelehnt');
const r2 = await call(B, 'results', { code });
t(r2.list.find(x => x.u === B.uid).h === Math.floor(R[1].st.maxY / 10), 'Höhe kommt immer aus der Server-Nachrechnung');
// Aufgeben: Server rechnet nur bis zum gemeldeten Tick
{ const X = P(), q = await call(X, 'create'); await call(X, 'start', { code: q.room.code, fill: true });
  const g = C.createGame(q.room.seed, 'duel'), th = makeBot(.5, 3); while (g.tick < 900) { const c = th(g); if (c) C.input(g, c); C.step(g); g.events.length = 0; }
  const f = await call(X, 'finish', { code: q.room.code, inputs: g.inputs, tick: g.tick });
  t(f.ok && f.height === Math.floor(g.maxY / 10), `Aufgeben nach 15 s zählt ${f.height} m (lokal ${Math.floor(g.maxY / 10)} m)`); }
{ const fillChars = st.room.fill.map(f => f.ch); t(new Set(fillChars).size === fillChars.length && !fillChars.includes('kiki'), 'Bots haben unterschiedliche Figuren, nicht die der Menschen'); }

// ---------- 4) Geister: nächstes Rennen auf derselben Strecke bekommt die Aufzeichnungen ----------
const g1 = await call(D, 'quick');
__data.get(`duel/rooms/${g1.room.code}`).val.seed = seed;      // gleiche Strecke erzwingen
NOW = g1.room.startAt - 1000;
const gs = await call(D, 'state', { code: g1.room.code });
const ghosts = gs.room.fill.filter(f => f.kind === 'ghost');
t(gs.room.fill.length === 3 && ghosts.length === 2, `Auffüllen: ${ghosts.length} Geister + ${gs.room.fill.length - ghosts.length} Bot`);
for (const g of ghosts) { const sim = C.simulate(seed, 'duel', g.inputs); t(sim.ok && sim.height === g.h, `Geist ${g.n} exakt nachspielbar (${g.h} m)`); }

// ---------- 5) Raum mit Code ----------
NOW += 60000;
const cr = await call(D, 'create');
t(cr.ok && !cr.room.pub && !cr.room.startAt, 'eigener Raum wartet auf Start');
t((await call(D, 'start', { code: cr.room.code })).status === 409, 'allein ohne Auffüllen geht nicht');
const j = await call(E, 'join', { code: cr.room.code });
t(j.ok && j.room.players.length === 2, 'Freund tritt per Code bei');
t((await call(E, 'start', { code: cr.room.code })).status === 409, 'nur der Gastgeber startet');
const sd = await call(D, 'start', { code: cr.room.code, fill: true });
t(sd.ok && sd.room.startAt - sd.now === 4000, 'Gastgeber startet (mit Auffüllen)');
NOW = sd.room.startAt - 1000;
const sl = await call(E, 'state', { code: cr.room.code });
t(sl.room.locked && sl.room.fill.length === 2, 'freie Plätze aufgefüllt');
const solo = await call(P(), 'create');
t(solo.ok, 'Raum für Training');
const alone = await call(D, 'create'); const al = await call(D, 'start', { code: alone.room.code, fill: true });
t(al.ok, 'allein mit Bots starten geht');
const fullRoom = await call(D, 'create');
for (const p of [P(), P(), P()]) await call(p, 'join', { code: fullRoom.room.code });
t((await call(P(), 'join', { code: fullRoom.room.code })).status === 409, '5. Spieler wird abgewiesen');
await call(D, 'leave', { code: fullRoom.room.code });
const after = await call(E, 'state', { code: fullRoom.room.code }).catch(() => null);
t(after && after.room.players.length === 3 && after.room.host !== D.uid, 'Gastgeber geht → neuer Gastgeber');
t((await call(A, 'nope')).status === 400, 'unbekannte Aktion');
t((await duel(new Request('http://x/api/duel', { method: 'POST', body: JSON.stringify({ uid: A.uid, secret: hex(20), action: 'quick' }) }))).status === 401, 'falsches Geheimnis → 401');
t((await call(A, 'state', { code: 'ZZZZZ' })).status === 404, 'unbekannter Raum → 404');

// ---------- Revanche: Gruppe bleibt zusammen ----------
{
  const H = P(), F1 = P(), F2 = P();
  const room = (await call(H, 'create')).room; await call(F1, 'join', { code: room.code }); await call(F2, 'join', { code: room.code });
  const s0 = await call(H, 'start', { code: room.code }); NOW = s0.room.startAt + 100000;
  const m1 = await call(F1, 'rematch', { code: room.code });
  t(m1.ok && m1.room.code !== room.code && m1.room.players.length === 1 && m1.room.host === F1.uid, 'Revanche: Erster öffnet den Folgeraum');
  const st0 = await call(H, 'state', { code: room.code });
  t(st0.room.next === m1.room.code, 'alter Raum zeigt auf den Folgeraum');
  const m2 = await call(H, 'rematch', { code: room.code }), m3 = await call(F2, 'rematch', { code: room.code });
  t(m2.room.code === m1.room.code && m3.room.code === m1.room.code && m3.room.players.length === 3, 'alle drei landen im selben Folgeraum');
  t((await call(P(), 'rematch', { code: room.code })).status === 404, 'Fremde können nicht in die Revanche');
  const go = await call(F1, 'start', { code: m1.room.code }); t(go.ok, 'neuer Gastgeber startet die Revanche');
  const X = P(), Y = P(), r2 = (await call(X, 'create')).room; await call(Y, 'join', { code: r2.code });
  const nx = await call(X, 'rematch', { code: r2.code }); const gx = await call(X, 'start', { code: nx.room.code, fill: true });
  NOW = gx.room.startAt + 1;
  const late = await call(Y, 'rematch', { code: r2.code });
  t(late.ok && late.room.code !== nx.room.code && late.room.players.length === 1, 'zu spät: neuer Folgeraum statt Fehler');
}
Date.now = realNow;
console.log(`${bad ? '✖' : '✔'} Duell-Server: ${ok} Prüfungen ok, ${bad} fehlgeschlagen · Rennen ${exp.join(' / ')} m`);
process.exit(bad ? 1 : 0);
