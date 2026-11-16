// Duell-Varianten: Zeit, K.O., Kollision (Spielkern + Server-Nachprüfung der Treffer)
import duel from '../netlify/functions/duel.mjs';
import { makeBot } from '../www/bot.js';
import * as C from '../www/core.js';

let ok = 0, bad = 0;
const t = (c, m) => { if (c) ok++; else { bad++; console.log('✖', m); } };
let NOW = Date.now(); Date.now = () => NOW;
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const P = () => ({ uid: crypto.randomUUID(), secret: hex(20) });
const D = async (p, action, body = {}) => { const r = await duel(new Request('http://x/api/duel', { method: 'POST', body: JSON.stringify({ ...p, action, char: 'hops', style: {}, ...body }) })); return { status: r.status, ...(await r.json()) }; };
const botRun = (seed, opts, skill = .5, bs = 3, max = 60 * 60 * 20) => { const st = C.createGame(seed, 'duel', opts), th = makeBot(skill, bs); while (!st.over && st.tick < max) { const c = th(st); if (c) C.input(st, c); C.step(st); st.events.length = 0; } return st; };

// ---------- Spielkern ----------
t(C.duelRules({}).time === 90 * 60 && C.isStdDuel(C.duelRules({})), 'Standard: 90 s');
t(C.duelRules({ time: 180 }).time === 180 * 60 && C.duelRules({ time: 77 }).time === 90 * 60, 'Zeiten nur aus der Liste');
const g60 = botRun('dm-1', { time: 60 }); t(g60.over && g60.cause === 'time' && g60.tick === 3600, '60-s-Rennen endet nach 60 s');
const gk = botRun('dm-2', { ko: true }, .15); t(gk.over && gk.cause !== 'time' && gk.deaths === 0, 'K.O.: erster Absturz beendet den Lauf (' + gk.cause + ' nach ' + Math.round(gk.tick / 60) + ' s)');
const gn = C.createGame('dm-3', 'duel', {}); t(!C.input(gn, 'S1'), 'ohne Kollision keine Treffer-Codes');
const gc = C.createGame('dm-3', 'duel', { collide: true });
t(!C.input(gc, 'S1'), 'Draufspringen nur im Fallen');
while (gc.p.vy >= 0) C.step(gc);
t(C.input(gc, 'S1') && gc.p.vy === C.STOMP_V && gc.stats.stomps === 1, 'Draufspringen: Abprall nach oben');
t(C.input(gc, 'k2s') && gc.p.drop === 1, 'Getroffen von oben: fällt durch die nächste Plattform');
const lane = gc.p.lane; t(C.input(gc, 'k2l') && gc.p.lane === lane - 1, 'Gerammt: eine Bahn weggeschoben');
const rep = C.simulate('dm-3', 'duel', gc.inputs, { collide: true }, gc.tick);
t(rep.ok, 'Treffer-Codes sind im Replay gültig');

// ---------- Server: Räume mit Regeln ----------
const A = P(), B = P();
let r = await D(A, 'create', { rules: { collide: true, time: 60 } });
t(r.ok && r.room.rules.collide && r.room.rules.time === 60 && r.room.raceMs === 60000, 'Raum mit Kollision und 60 s');
const code = r.room.code;
t((await D(B, 'rules', { code, rules: { ko: true } })).status === 409, 'nur der Gastgeber ändert Regeln');
t((await D(A, 'rules', { code, rules: { collide: true, time: 120 } })).room.rules.time === 120, 'Gastgeber ändert Regeln');
await D(A, 'rules', { code, rules: { collide: true, time: 60 } });
await D(B, 'join', { code });
await D(A, 'start', { code });
NOW += 4100; const st = (await D(A, 'state', { code })).room;
t(st.locked && !st.fill.length, 'Start ohne Füller');
const quick = await D(P(), 'quick'); t(quick.room.rules.time === 90 && !quick.room.rules.ko && !quick.room.rules.collide, 'Schnelles Rennen bleibt Standard');

// Beide spielen dieselben Eingaben → stehen exakt übereinander. A springt B (echt) auf den Kopf.
const base = botRun(st.seed, { collide: true, time: 60 }, .4, 7, 3600);
const mv = base.inputs.filter(([tk]) => tk < 3600);
const ga = C.createGame(st.seed, 'duel', { collide: true, time: 60 });
let hitT = -1, ia = 0;
while (!ga.over) { while (ia < mv.length && mv[ia][0] === ga.tick) { C.input(ga, mv[ia][1]); ia++; } if (hitT < 0 && ga.tick > 300 && ga.p.vy < 0 && ga.p.down <= 0 && ga.p.jet <= 0 && C.input(ga, 'S1')) hitT = ga.tick; C.step(ga); ga.events.length = 0; }
t(hitT > 0, 'echter Treffer im Lauf von A');
const withK = (moves, at, code) => { const out = [], g = C.createGame(st.seed, 'duel', { collide: true, time: 60 }); let i = 0, done = false; while (!g.over) { while (i < moves.length && moves[i][0] === g.tick) { C.input(g, moves[i][1]); i++; } if (!done && g.tick >= at && g.p.down <= 0 && C.input(g, code)) done = true; C.step(g); g.events.length = 0; } return g.inputs; };
const gbIn = withK(mv, hitT + 40, 'k0s');
NOW += 61000;
await D(A, 'finish', { code, inputs: ga.inputs, tick: ga.tick });
await D(B, 'finish', { code, inputs: gbIn, tick: 3600 });
let res = await D(A, 'results', { code });
t(res.all && !res.list.some(x => x.dq), 'ehrlicher Treffer + eingetragen: niemand disqualifiziert ' + JSON.stringify(res.list.map(x => [x.n, x.dq])));

// Raum 2: A erfindet einen Treffer auf B, der weit weg ist; B ignoriert einen echten Treffer nicht (keiner da)
r = await D(A, 'create', { rules: { collide: true, time: 60 } }); const code2 = r.room.code;
await D(B, 'join', { code: code2 }); await D(A, 'start', { code: code2 }); NOW += 4100; const st2 = (await D(A, 'state', { code: code2 })).room;
const a2 = botRun(st2.seed, { collide: true, time: 60 }, .5, 11, 3600), b2 = botRun(st2.seed, { collide: true, time: 60 }, .1, 2, 3600);
// erfundener Treffer: kurz vor Schluss, B steht ganz woanders
const fake = C.createGame(st2.seed, 'duel', { collide: true, time: 60 }); let j = 0, fk = false;
while (!fake.over) { while (j < a2.inputs.length && a2.inputs[j][0] === fake.tick) { C.input(fake, a2.inputs[j][1]); j++; } if (!fk && fake.tick > 2000 && fake.p.vy < 0 && fake.p.jet <= 0 && Math.abs(fake.p.y - b2.maxY) > 3000 && C.input(fake, 'S1')) fk = true; C.step(fake); fake.events.length = 0; }
NOW += 61000;
await D(A, 'finish', { code: code2, inputs: fake.inputs, tick: fake.tick });
await D(B, 'finish', { code: code2, inputs: b2.inputs, tick: 3600 });
res = await D(A, 'results', { code: code2 });
const ra = res.list.find(x => x.u === A.uid), rb = res.list.find(x => x.u === B.uid);
t(fk && ra.dq === 'hit' && ra.h === 0 && !rb.dq, 'erfundener Treffer → disqualifiziert');

// Raum 3: echter Treffer, B trägt ihn nicht ein → B disqualifiziert
r = await D(A, 'create', { rules: { collide: true, time: 60 } }); const code3 = r.room.code;
await D(B, 'join', { code: code3 }); await D(A, 'start', { code: code3 }); NOW += 4100; const st3 = (await D(A, 'state', { code: code3 })).room;
const base3 = botRun(st3.seed, { collide: true, time: 60 }, .4, 7, 3600), mv3 = base3.inputs;
const g3 = C.createGame(st3.seed, 'duel', { collide: true, time: 60 }); let h3 = -1, i3 = 0;
while (!g3.over) { while (i3 < mv3.length && mv3[i3][0] === g3.tick) { C.input(g3, mv3[i3][1]); i3++; } if (h3 < 0 && g3.tick > 300 && g3.tick < 2000 && g3.p.vy < 0 && g3.p.down <= 0 && g3.p.jet <= 0 && C.input(g3, 'S1')) h3 = g3.tick; C.step(g3); g3.events.length = 0; }
NOW += 61000;
await D(A, 'finish', { code: code3, inputs: g3.inputs, tick: g3.tick });
await D(B, 'finish', { code: code3, inputs: mv3, tick: 3600 });
res = await D(A, 'results', { code: code3 });
t(res.list.find(x => x.u === B.uid).dq === 'ignored' && !res.list.find(x => x.u === A.uid).dq, 'Treffer ignoriert → disqualifiziert');

// ---------- K.O. mit Bots: wer länger überlebt, steht vorne ----------
r = await D(A, 'create', { rules: { ko: true } }); const code4 = r.room.code;
await D(A, 'start', { code: code4, fill: true }); NOW += 4100; const st4 = (await D(A, 'state', { code: code4 })).room;
t(st4.fill.length === 3 && st4.fill.every(f => f.kind === 'bot'), 'K.O.: nur Bots als Füller (keine Geister)');
const k4 = botRun(st4.seed, { ko: true }, .05, 1, 60 * 60 * 15);
NOW += k4.tick / 60 * 1000 + 500;
await D(A, 'finish', { code: code4, inputs: k4.inputs, tick: k4.tick });
res = await D(A, 'results', { code: code4 });
const sorted = res.list.every((x, i, l) => i === 0 || (l[i - 1].out - x.out) < 0 || (l[i - 1].out === x.out && l[i - 1].t >= x.t));
t(res.all && sorted && res.rules.ko, 'K.O.-Wertung nach Überlebenszeit ' + JSON.stringify(res.list.map(x => [x.n.slice(0, 8), x.out, Math.round(x.t / 60)])));

console.log(bad ? `Duell-Varianten: ${bad} FEHLER, ${ok} ok` : `Duell-Varianten: alle ${ok} Prüfungen ok`);
process.exit(bad ? 1 : 0);
