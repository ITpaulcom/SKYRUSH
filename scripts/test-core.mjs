// Testet den Spielkern: Determinismus, Replay-Prüfung, Regeln, Balance, Server-Kopie
import * as C from '../www/core.js';
import fs from 'node:fs';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };

// Bot mit begrenzter Reaktionszeit: steuert die nächste erreichbare Plattform an und weicht Drohnen aus
export function bot(seed, mode, { react = 6, rescueOk = true, opts = {} } = {}) {
  const st = C.createGame(seed, mode, opts);
  let wait = 0;
  while (st.tick < C.MAX_TICKS) {
    if (st.over) { if (rescueOk && C.rescue(st)) continue; break; }
    if (wait > 0) wait--;
    else {
      const p = st.p;
      const apex = p.vy > 0 ? p.y + p.vy * p.vy / (2 * C.G) : p.y;
      // höchste erreichbare Reihe, darin die nächstgelegene Plattform (max. 2 Bahnen weit)
      let target = null;
      for (const pl of st.plats) {
        if (pl.hit < 0 || pl.y > apex - 5 || pl.y < st.cam || Math.abs(pl.lane - p.lane) > 2) continue;
        if (!target || pl.y > target.y || (pl.y === target.y && Math.abs(pl.lane - p.x) < Math.abs(target.lane - p.x))) target = pl;
      }
      let want = target ? target.lane : p.lane;
      const danger = l => st.obst.some(o => !o.dead && Math.abs(o.x - l) < 0.6 && o.y > p.y - 30 && o.y < p.y + 160);
      if (danger(want) || (want !== p.lane && danger(p.lane + Math.sign(want - p.lane)))) {
        const alt = [...Array(C.LANES).keys()].filter(l => !danger(l) && Math.abs(l - p.lane) <= 1).sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
        if (alt.length) want = alt[0];
      }
      if (want !== p.lane) { C.input(st, want < p.lane ? 'L' : 'R'); wait = react; }
      else if (!target && p.vy < 0 && p.dash) { C.input(st, 'U'); wait = react; }
    }
    C.step(st); st.events.length = 0;
  }
  return st;
}

// Fairness: Jede Bahn hat in jeder Reihe eine Plattform in Reichweite
function fairness(seed) {
  const st = C.createGame(seed, 'endless');
  st.cam = 20000; C.generate(st);   // 2 km Welt vorausgenerieren
  const rows = new Map();
  for (const pl of st.plats) { if (!rows.has(pl.y)) rows.set(pl.y, []); rows.get(pl.y).push(pl.lane); }
  let bad = 0;
  for (const [y, lanes] of rows) {
    if (y === 0) continue;
    const reach = 2; // ab 350 m ±2, davor sogar ±1 (strenger Test unten)
    for (let l = 0; l < C.LANES; l++) if (!lanes.some(x => Math.abs(x - l) <= reach)) bad++;
  }
  return { rows: rows.size, bad };
}

const t0 = Date.now();
{ // Keine Überlagerungen: Objekte untereinander und mit Plattformen
  let bad = 0, n = 0;
  for (const seed of ['ov1', 'ov2', 'ov3']) {
    const st = C.createGame(seed, 'endless'); st.cam = 15000; C.generate(st);
    const obj = [...st.items.map(i => ({ lane: i.lane, y: i.y, r: C.SPACE[i.kind] })), ...st.obst.map(o => ({ lane: o.lane, y: o.y, r: C.SPACE.drone }))];
    n += obj.length;
    for (let i = 0; i < obj.length; i++) {
      for (let j = i + 1; j < obj.length; j++) if (obj[i].lane === obj[j].lane && Math.abs(obj[i].y - obj[j].y) < obj[i].r + obj[j].r) bad++;
      for (const pl of st.plats) if (pl.lane === obj[i].lane && obj[i].y + obj[i].r > pl.y - 26 && obj[i].y - obj[i].r < pl.y + (pl.type === 's' ? 34 : 6)) bad++;
    }
  }
  ok(bad === 0 && n > 300, `keine Überlagerungen (${n} Objekte geprüft)`);
}
const fr = fairness('fair-1');
ok(fr.rows > 100 && fr.bad === 0, `jede Bahn erreicht eine Plattform (${fr.rows} Reihen geprüft)`);
const a = bot('test-1', 'endless'), b = bot('test-1', 'endless');
ok(a.score === b.score && a.tick === b.tick, `deterministisch (Score ${a.score}, Höhe ${Math.floor(a.maxY / 10)} m, ${(a.tick / 60).toFixed(0)} s, Ende: ${a.cause})`);
const sim = C.simulate('test-1', 'endless', a.inputs);
ok(sim.ok && sim.score === a.score && sim.over === a.over, `Replay ergibt identischen Score (${sim.err || 'ok'})`);
const forged = a.inputs.map(x => x.slice()); const fi = forged.findIndex(m => typeof m[0] === 'number' && m[0] > 200 && m[1] === 'L'); if (fi >= 0) forged[fi][1] = 'R';
const fs2 = C.simulate('test-1', 'endless', forged);
ok(!fs2.ok || fs2.score !== a.score, 'manipuliertes Replay erkannt');
ok(!C.simulate('daily-x', 'daily', [['c', 0]]).ok, 'Zweite Chance im Tagespuzzle abgelehnt');
const d = bot('daily-2026-10-21', 'daily', { rescueOk: false });
ok(C.simulate('daily-2026-10-21', 'daily', d.inputs).ok, 'Tages-Replay gültig');
const up = bot('test-1', 'endless', { opts: { levels: { jet: 5 }, mult: 3 } });
ok(C.simulate('test-1', 'endless', up.inputs, { levels: { jet: 5 }, mult: 3 }).score === up.score, 'Upgrades & Multiplikator im Replay');
const hs = bot('test-hs', 'endless', { opts: { headstart: true } });
ok(C.simulate('test-hs', 'endless', hs.inputs, { headstart: true }).score === hs.score && hs.maxY > 1200, `Kopfstart im Replay (${Math.floor(hs.maxY / 10)} m)`);
ok(C.createGame('d', 'daily', { headstart: true }).p.jet === 0, 'kein Kopfstart im Tages-Run');
ok(C.powerDur('jet', 5) === 210 + 150 && C.powerDur('jet', 15) === 210 + 150 + 150 && C.powerDur('jet', 6) - C.powerDur('jet', 5) === 15, 'Stufe 6–15: halbe Wirkung je Stufe');
const u15 = bot('test-15', 'endless', { opts: { levels: { jet: 15, magnet: 15, shield: 15, boots: 15 } } });
ok(C.simulate('test-15', 'endless', u15.inputs, { levels: { jet: 15, magnet: 15, shield: 15, boots: 15 } }).score === u15.score, 'Stufe 15 im Replay');
ok(C.createGame('x', 'endless', { levels: { jet: 99 } }).levels.jet === 15, 'Stufen auf 15 begrenzt');
let rushes = 0, cps = 0; for (let s = 0; s < 6; s++) { const g = bot('r' + s, 'endless', { rescueOk: false }); rushes += g.stats.rushes; cps += g.checkpoints; }
ok(rushes > 0 && cps > 0, `Rush-Modus (${rushes}×) und Checkpoints (${cps}×) kommen vor`);

for (const react of [4, 10, 18]) {
  const L = [], S = [], H = [], cause = {};
  for (let s = 0; s < 12; s++) { const g = bot('s' + s, 'endless', { react, rescueOk: false }); L.push(g.tick / 60); S.push(g.score); H.push(Math.floor(g.maxY / 10)); cause[g.cause] = (cause[g.cause] || 0) + 1; }
  L.sort((x, y) => x - y); H.sort((x, y) => x - y);
  console.log(`     Reaktion ${react} Ticks: Dauer Median ${L[6].toFixed(0)} s (${L[0].toFixed(0)}–${L[11].toFixed(0)}), Höhe Median ${H[6]} m, Enden ${JSON.stringify(cause)}`);
}
const idle = C.createGame('idle', 'endless'); while (!idle.over) C.step(idle);
ok(idle.over && idle.tick < 60 * 60, `ohne Eingabe endet die Runde (${(idle.tick / 60).toFixed(0)} s, ${idle.cause})`);
ok(C.weekKey(new Date('2026-10-21T12:00:00Z')) === '2026-W43', 'Wochen-Schlüssel');
// Fall-Puffer: 25 m unter den Höchststand fallen ist erlaubt, tiefer nicht
{
  const g = C.createGame('fall-t', 'endless', { levels: { jet: 5 } }); g.p.jet = 400; while (g.camHigh < 3000) C.step(g);
  const killAll = () => { g.plats.length = 0; g.obst.length = 0; g.storm = g.camHigh - 2000; };
  killAll(); g.p.jet = 0; g.p.y = g.camHigh - 150; g.p.vy = -2; for (let i = 0; i < 6; i++) { killAll(); g.p.y = g.camHigh - 150; g.p.vy = -1; C.step(g); }
  ok(!g.over && g.cam < g.camHigh, `15 m unter dem Höchststand: noch am Leben, Kamera fällt mit (${Math.round(g.camHigh - g.cam)} Einheiten)`);
  killAll(); g.p.y = g.camHigh - 320; g.p.vy = -1; C.step(g);
  ok(g.over && g.cause === 'fall', '32 m tiefer: Absturz');
  const h = C.createGame('fall-s', 'endless'); for (let i = 0; i < 400; i++) C.step(h); h.plats.length = 0; h.storm = h.camHigh - 100; h.p.y = h.camHigh - 140; h.p.vy = -1; C.step(h);
  ok(h.over && h.cause === 'storm', 'Sturm holt einen auch innerhalb des Puffers');
  const e = C.createGame('end-t', 'duel'); while (e.tick < 5400) C.step(e);
  ok(!C.input(e, 'L'), 'beim Schlusspfiff keine Eingabe mehr');
  const q = C.createGame('quit-t', 'duel'); for (let i = 0; i < 300; i++) C.step(q); C.input(q, 'R');
  const sq = C.simulate('quit-t', 'duel', q.inputs, {}, q.tick); ok(sq.ok && sq.height === Math.floor(q.maxY / 10), 'Aufgeben mit Eingabe im selben Moment wird akzeptiert');
}
// Duell: 90-s-Rennen mit Wiedereinstieg
{
  const g = C.createGame('duel-t', 'duel'); while (!g.over) C.step(g);
  ok(g.over && g.cause === 'time' && g.tick === 90 * 60, `Duell endet nach genau 90 s (${g.tick} Ticks)`);
  ok(g.deaths > 0 && g.maxY > 40, `Duell ohne Eingaben: ${g.deaths} Wiedereinstiege statt Rundenende`);
  const s1 = C.simulate('duel-t', 'duel', []); ok(s1.ok && s1.height === Math.floor(g.maxY / 10), 'Duell-Replay stimmt');
  const d0 = C.createGame('duel-x', 'duel'); d0.p.down = 5; ok(!C.input(d0, 'L'), 'keine Eingaben während des Wiedereinstiegs');
  ok(!C.simulate('duel-t', 'duel', [[10, 'L'], ['c', 20]]).ok, 'keine Zweite Chance im Duell');
}
// Drohnen: seitlich hineinsprinten besiegt sie; fliegt eine bewegliche Drohne dich seitlich an, ist man getroffen
{
  const mk = moving => { const st = C.createGame('drone-side', 'endless'); for (let i = 0; i < 30; i++) C.step(st); st.obst = []; st.items = []; st.p.jet = st.p.inv = st.p.shield = st.p.rush = 0; st.p.vy = 1; return st; };
  const a = mk(false), c0 = a.coins, lane = a.p.lane;
  a.obst.push({ id: 9e6, lane: lane + 1, x: lane + 1, ox: lane + 1, y: a.p.y + 20, kind: 'drone', moving: false, dir: 1, t: 0, dead: false });
  C.input(a, 'R');
  for (let i = 0; i < 12 && !a.over; i++) { a.obst[0].y = a.p.y + 20; C.step(a); }
  ok(!a.over && a.obst[0].dead && a.stats.sides === 1 && a.coins - c0 === C.DRONE_REWARD.still.side[1] && C.droneValue(C.DRONE_REWARD.still.side) === 50, `Seitenhieb besiegt stehende Drohne (+${a.coins - c0} Münzen)`);
  const b = mk(true), l2 = b.p.lane;
  b.obst.push({ id: 9e6, lane: l2 + 1, x: l2 + 1, ox: l2 + 1, y: b.p.y + 20, kind: 'drone', moving: true, dir: -1, t: 99, dead: false });
  for (let i = 0; i < 20 && !b.over; i++) { b.obst[0].y = b.p.y + 20; C.step(b); }
  ok(b.over && b.cause === 'drone', 'bewegliche Drohne, die einen seitlich anfliegt, trifft');
  const d = mk(true), l3 = d.p.lane, c3 = d.coins;
  d.obst.push({ id: 9e6, lane: l3 + 1, x: l3 + 1, ox: l3 + 1, y: d.p.y + 20, kind: 'drone', moving: true, dir: 1, t: 0, dead: false });
  C.input(d, 'R');
  for (let i = 0; i < 12 && !d.over; i++) { d.obst[0].y = d.p.y + 20; C.step(d); }
  ok(Object.values(C.DRONE_REWARD).flatMap(v => Array.isArray(v) ? [v] : Object.values(v)).every(r => C.droneValue(r) <= 100), 'keine Drohne bringt mehr als 100 Punkte');
  ok(!d.over && d.stats.movers === 1 && d.coins - c3 === C.DRONE_REWARD.moving.side[1] && C.droneValue(C.DRONE_REWARD.moving.side) === 100, `bewegliche Drohne seitlich erwischt: mehr Belohnung (+${d.coins - c3})`);
}
// Rush und Jetpack enden in der Luft nicht schutzlos: Rush hält bis zur Landung, danach kurz unverwundbar
{
  const st = C.createGame('rush-hold', 'endless'); for (let i = 0; i < 20; i++) C.step(st);
  st.p.rush = 3; st.p.vy = 20; st.plats = st.plats.filter(q => q.y < st.p.y - 2000);
  for (let i = 0; i < 30; i++) C.step(st);
  ok(st.p.rush === 1 && st.p.hold, 'Rush wird in der Luft gehalten');
  st.obst = [{ id: 9e6, lane: st.p.lane, x: st.p.lane, ox: st.p.lane, y: st.p.y + 20 + st.p.vy, kind: 'drone', moving: false, dir: 1, t: 0, dead: false }];
  st.p.vy = 1; C.step(st);
  ok(!st.over && st.obst[0].dead, 'Drohne direkt nach Rush-Ende in der Luft: kein Absturz');
  st.plats.push({ id: 9e6 + 1, lane: st.p.lane, x: st.p.lane, from: st.p.lane, mt: C.MOVE_TICKS, y: st.p.y - 30, type: 'n', hit: 0, dir: 1 });
  for (let i = 0; i < 40 && st.p.rush; i++) C.step(st);
  ok(st.p.rush === 0 && st.p.inv > 0 && !st.over, 'Rush endet erst mit der Landung, danach kurz geschützt');
  const j = C.createGame('jet-safe', 'endless'); for (let i = 0; i < 20; i++) C.step(j); j.p.jet = 2; j.p.inv = 0; for (let i = 0; i < 5; i++) C.step(j);
  ok(j.p.safe > 0 && j.p.inv > 0, 'nach dem Jetpack bis zur Landung geschützt');
}
// Endlos: bis zu 3 Wiederbelebungen; Himmelssegen alle 10.000 m (Schild, Jet, ein Leben zurück)
{
  const st = C.createGame('bless', 'endless', { levels: { shield: 15 } }); for (let i = 0; i < 10; i++) C.step(st);
  st.continuesUsed = 2; st.p.y = st.maxY = C.MILESTONE - 5; st.cam = st.camHigh = st.p.y - 300; st.storm = st.cam - 400; st.p.vy = 10; C.step(st);
  ok(st.blessings === 1 && st.p.shield > 0 && st.p.hits === 3 && st.p.jet > 0 && st.continuesUsed === 2, 'Himmelssegen: Schild mit 3 Treffern (Stufe 15), Jet – aber kein Extra-Leben');
  const g = C.createGame('three', 'endless'); let n = 0; while (n < 4 && g.tick < 60 * 60 * 10) { C.step(g); if (g.over) { if (!C.rescue(g)) break; n++; } }
  ok(n === 3 && !C.rescue(g), 'genau 3 Wiederbelebungen pro Lauf');
  const sim = C.simulate('three', 'endless', g.inputs); ok(sim.ok, 'Replay mit 3 Wiederbelebungen gültig');
}
// Feder im Rush: Mega-Sprung, höher als eine normale Feder, aber nicht doppelt
{
  const jump = (rush, boots) => { const st = C.createGame('mega', 'endless'); for (let i = 0; i < 5; i++) C.step(st);
    st.plats = [{ id: 9e6, lane: st.p.lane, x: st.p.lane, from: st.p.lane, mt: C.MOVE_TICKS, y: st.p.y - 5, type: 's', hit: 0, dir: 1 }]; st.obst = [];
    st.p.vy = -6; st.p.jet = 0; st.p.rush = rush; st.p.boots = boots; C.step(st); return st.p.vy; };
  const n = jump(0, 0), m = jump(200, 0), u = jump(200, 300), ratio = (m * m) / (n * n);
  ok(n === C.SPRING_V && m > n && u > m && ratio > 1.2 && ratio < 1.5, `Mega-Sprung: ${((ratio - 1) * 100).toFixed(0)} % höher als Feder, mit Rush + Schuhen ${((u * u / (n * n) - 1) * 100).toFixed(0)} %`);
}
// Welten: feste Reise bis 10.000 m, danach Wanderung über passende Nachbarwelten (keine Wiederholung direkt hintereinander)
{
  const N = C.BIOMES.length + 9 * 60, bases = new Set();
  let rep = 0, unlinked = 0, near = 0;
  for (let i = 0; i < N; i++) {
    const w = C.worldInfo(i); bases.add(w.base);
    if (i && C.worldInfo(i - 1).base === w.base) rep++;
    if (i > C.BIOMES.length && !C.NEXT[C.worldInfo(i - 1).base].includes(w.base)) unlinked++;
    for (let k = 2; k <= 3; k++) if (i >= k && C.worldInfo(i - k).base === w.base) near++;
    if (!C.WORLD_NAMES[w.base] && i >= C.BIOMES.length) { ok(false, 'Weltname fehlt: ' + w.base); break; }
  }
  ok(rep === 0 && near === 0, `Welten: nie dieselbe Welt innerhalb von 3 Schritten (${N} Welten geprüft)`);
  ok(unlinked === 0, 'Welten: jeder Wechsel nach 10.000 m führt in eine passende Nachbarwelt');
  ok(bases.size === 26, `Welten: alle 26 Hintergründe kommen vor (${bases.size})`);
  const seen = new Set(); for (let i = 0; i < C.BIOMES.length + 9; i++) seen.add(C.worldInfo(i).base);
  ok(seen.size === 26, 'Welten: bis 20.000 m hat man jede Welt einmal gesehen');
  ok(C.worldAt(100000).special === 1 && C.worldAt(109000).i === C.BIOMES.length, 'Himmelstor bei 10.000 m, danach erste endlose Welt');
  ok(C.worldInfo(C.BIOMES.length + 3).at > C.worldInfo(C.BIOMES.length + 2).at, 'Welt-Höhen steigen');
}
console.log(`     Laufzeit ${Date.now() - t0} ms`);
if (fails) { console.error(`${fails} Test(s) fehlgeschlagen`); process.exit(1); }
console.log('Alle Tests bestanden.');
