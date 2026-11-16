// Test der Anti-Cheat-Prüfungen (Speicher im Arbeitsspeicher, Uhr gesteuert). Aufruf: npm run test:ac
import run from '../netlify/functions/run.mjs';
import submit from '../netlify/functions/submit-score.mjs';
import board from '../netlify/functions/leaderboard.mjs';
import admin from '../netlify/functions/admin.mjs';
import { __data } from './mock/blobs.mjs';
import { makeBot } from '../www/bot.js';
import * as C from '../www/core.js';

let ok = 0, bad = 0;
const t = (c, m) => { if (c) ok++; else { bad++; console.log('✖', m); } };
let NOW = Date.now(); Date.now = () => NOW;
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const P = () => ({ uid: crypto.randomUUID(), secret: hex(20) });
const post = async (fn, path, body, hdr = {}) => { const r = await fn(new Request('http://x' + path, { method: 'POST', body: JSON.stringify(body), headers: hdr })); return { status: r.status, ...(await r.json()) }; };
const R = (p, action, body = {}) => post(run, '/api/run', { ...p, action, ...body });
const S = (p, ticket, moves, score) => post(submit, '/api/submit-score', { ...p, ticket, moves, score });
// Ein Lauf wie im Spiel: Bot spielt bis zum Ende (oder maxTicks)
function play(seed, mode, opts, skill = .7, maxTicks = 60 * 40) {
  const st = C.createGame(seed, mode, opts), think = makeBot(skill, 5);
  while (!st.over && st.tick < maxTicks) { const c = think(st); if (c) C.input(st, c); C.step(st); st.events.length = 0; }
  if (!st.over) { st.over = true; }
  return st;
}
const sim = (seed, mode, moves, opts) => C.simulate(seed, mode, moves, opts);
const A = P(), opts = { levels: { jet: 3, magnet: 2, shield: 1, boots: 0 }, mult: 2 };

// ---------- 1) Ehrlicher Lauf: Welt vom Server, Ticket, Echtzeit → Rangliste ----------
const s1 = await R(A, 'seed'); t(s1.ok && /^e[a-z0-9]+$/.test(s1.seed), 'Server vergibt die Welt');
t((await R(A, 'seed')).seed === s1.seed, 'bis zum Start immer dieselbe Welt (kein Durchprobieren)');
const id1 = hex(12);
t((await R(A, 'begin', { id: id1, mode: 'endless', seed: 'e' + hex(4), opts })).error === 'seed', 'selbst gewählte Welt wird abgelehnt');
const b1 = await R(A, 'begin', { id: id1, mode: 'endless', seed: s1.seed, opts }); t(b1.ok, 'Lauf-Start: ' + b1.error);
let g = play(s1.seed, 'endless', opts); let v = sim(s1.seed, 'endless', g.inputs, opts);
t(v.ok, 'eigener Lauf nachspielbar');
NOW += v.ticks / 60 * 1000 + 800;
const r1 = await S(A, id1, g.inputs, v.score); t(r1.ok && r1.rank === 1, 'ehrlicher Lauf steht in der Rangliste: ' + (r1.error || r1.why));
t((await S(A, id1, g.inputs, v.score)).error === 'ticket', 'Ticket gilt nur einmal');
t((await S(A, hex(12), g.inputs, v.score)).error === 'ticket', 'ohne gültiges Ticket kein Eintrag');

// ---------- 2) Erfundene Punkte / veränderte Eingaben ----------
const B = P(); NOW += 5000;
const lap = async (p, o, fn) => { const sd = (await R(p, 'seed')).seed, id = hex(12); const bb = await R(p, 'begin', { id, mode: 'endless', seed: sd, opts: o }); if (!bb.ok) return { error: 'begin:' + bb.error }; return fn(sd, id); };
let r = await lap(B, opts, async (sd, id) => { const st = play(sd, 'endless', opts), vv = sim(sd, 'endless', st.inputs, opts); NOW += vv.ticks / 60 * 1000; return S(B, id, st.inputs, vv.score + 5000); });
t(r.error === 'score-mismatch', 'erfundene Punktzahl abgelehnt');
NOW += 5000;
r = await lap(B, opts, async (sd, id) => { const st = play(sd, 'endless', opts), vv = sim(sd, 'endless', st.inputs, opts); NOW += vv.ticks / 60 * 1000;
  const better = { levels: { jet: 15, magnet: 15, shield: 15, boots: 15 }, mult: 30 }; const vb = sim(sd, 'endless', st.inputs, better);
  const rr = await post(submit, '/api/submit-score', { ...B, ticket: id, moves: st.inputs, score: vb.ok ? vb.score : 1, opts: better }); return rr; });
t(!r.ok, 'Aufrüstungen lassen sich nach dem Start nicht mehr hochsetzen');

// ---------- 3) Speedhack / Sofort-Bot / Zeitlupe ----------
NOW += 5000;
r = await lap(B, opts, async (sd, id) => { const st = play(sd, 'endless', opts, .9, 60 * 120), vv = sim(sd, 'endless', st.inputs, opts); NOW += 3000; return { ...(await S(B, id, st.inputs, vv.score)), ticks: vv.ticks }; });
t(r.ticks < 60 * 12 || (r.error === 'rejected' && r.why === 'fast'), 'Lauf schneller als Echtzeit abgelehnt (' + r.ticks + ' Ticks)');
NOW += 5000;
r = await lap(B, opts, async (sd, id) => { const st = play(sd, 'endless', opts), vv = sim(sd, 'endless', st.inputs, opts); NOW += vv.ticks / 60 * 1000 * 4 + 25 * 60e3; return S(B, id, st.inputs, vv.score); });
t(r.error === 'rejected' && r.why === 'slow', 'Zeitlupe abgelehnt');
NOW += 5000;
r = await lap(B, opts, async (sd, id) => { const st = play(sd, 'endless', opts), vv = sim(sd, 'endless', st.inputs, opts); NOW += vv.ticks / 60 * 1000 + 6 * 60e3; return S(B, id, st.inputs, vv.score); });
t(r.ok, 'normale Pause (6 min) ist erlaubt: ' + (r.why || r.error));

// ---------- 4) Übermenschliche Eingaben ----------
{ const { analyze } = await import('../netlify/lib/anticheat.mjs');
  const human = []; for (let k = 0; k < 600; k++) human.push([k * 9, k % 2 ? 'L' : 'R']);       // ~7 Eingaben/s
  const robot = []; for (let k = 0; k < 600; k++) robot.push([k * 2, k % 2 ? 'L' : 'R']);       // 30 Eingaben/s
  t(!analyze(human).hard, 'schnelles menschliches Spiel bleibt erlaubt'); t(analyze(robot).hard === 'burst', 'Maschinen-Eingaben erkannt');
  let worst = 0; for (let sd = 0; sd < 12; sd++) { const st = play('eac' + sd, 'endless', opts, .95, 60 * 90); worst = Math.max(worst, analyze(st.inputs).maxBurst); }
  t(worst < 20, 'sehr gute Spieler lösen keinen Fehlalarm aus (max ' + worst + '/s)'); }

// ---------- 5) Versuche zählt der Server ----------
const D = P(); NOW += 5000;
let n = 0; for (let k = 0; k < 5; k++) { NOW += 2000; if ((await R(D, 'begin', { id: hex(12), mode: 'daily' })).ok) n++; }
t(n === 2, 'Tages-Run: nur begrenzte Versuche (' + n + ')');
n = 0; for (let k = 0; k < 10; k++) { NOW += 2000; if ((await R(D, 'begin', { id: hex(12), mode: 'tournament' })).ok) n++; }
t(n === 6, 'Turnier: nur begrenzte Versuche (' + n + ')');
NOW += 2000; const idd = hex(12); await R(D, 'seed');
t((await R(D, 'begin', { id: hex(12), mode: 'daily' })).error === 'attempts', 'weitere Versuche abgelehnt');
t((await R(A, 'begin', { id: hex(12), mode: 'endless', seed: 'x' })).status >= 400, 'Start ohne Server-Welt abgelehnt');
{ const s2 = (await R(D, 'seed')).seed; NOW += 3000; await R(D, 'begin', { id: hex(12), mode: 'endless', seed: s2 }); const s3 = (await R(D, 'seed')).seed; NOW += 100;
  const x1 = await R(D, 'begin', { id: hex(12), mode: 'endless', seed: s3 }); t(x1.error === 'rate', 'Starts im Sekundentakt gebremst'); }
t((await R({ uid: A.uid, secret: hex(20) }, 'seed')).status === 401, 'fremdes Konto ohne Geheimnis nicht nutzbar');

// ---------- 6) Sperren: verschwindet aus der Rangliste, neue Läufe zählen nicht ----------
process.env.ADMIN_TOKEN = 'tok-0123456789abcdefghijklmnop'; process.env.ADMIN_FAIL_DELAY = '0';
const top = async () => (await (await board(new Request('http://x/api/leaderboard?mode=endless&period=all'))).json()).top;
t((await top()).some(e => e.user_id === A.uid), 'vor der Sperre in der Rangliste');
const sess = (await post(admin, '/api/admin', { action: 'login', key: process.env.ADMIN_TOKEN }, { 'x-forwarded-for': '10.0.0.1' })).token;
const ad = await (await admin(new Request('http://x/api/admin', { headers: { authorization: 'Bearer ' + sess } }))).json();
t(ad.flags.some(f => f.why === 'score') && ad.flags.some(f => f.why === 'slow'), 'Zentrale zeigt abgelehnte Läufe');
t((await post(admin, '/api/admin', { action: 'ban', uid: A.uid }, {})).status === 401, 'Sperren nur mit Anmeldung');
t((await post(admin, '/api/admin', { action: 'ban', uid: A.uid }, { authorization: 'Bearer ' + process.env.ADMIN_TOKEN })).status === 401, 'Schlüssel direkt als Ausweis geht nicht (nur Sitzung)');
t((await post(admin, '/api/admin', { action: 'ban', uid: A.uid }, { authorization: 'Bearer ' + sess })).ok, 'Sperren');
t(!(await top()).some(e => e.user_id === A.uid), 'gesperrter Spieler ist aus der Rangliste entfernt');
NOW += 5000;
r = await lap(A, opts, async (sd, id) => { const st = play(sd, 'endless', opts), vv = sim(sd, 'endless', st.inputs, opts); NOW += vv.ticks / 60 * 1000; return S(A, id, st.inputs, vv.score); });
t(r.ok && r.rank === null && !(await top()).some(e => e.user_id === A.uid), 'gesperrter Spieler kommt nicht zurück in die Rangliste');
t([...__data.keys()].some(k => k.startsWith('ac/r/endless/all/')), 'Replay der Spitzenläufe wird aufbewahrt');

console.log(bad ? `Anti-Cheat: ${bad} FEHLER, ${ok} ok` : `Anti-Cheat: alle ${ok} Prüfungen ok`);
process.exit(bad ? 1 : 0);
