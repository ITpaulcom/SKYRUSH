// SKY RUSH – deterministischer Spielkern (Doodle-Jump-Aufstieg auf 11 Bahnen; sichtbar je nach Gerät 3 bis alle).
// Läuft identisch im Client und auf dem Server (Score-Prüfung per Replay).
// Nur + - * / und Vergleiche, feste 60 Ticks/Sekunde → bitgleiche Ergebnisse in allen JS-Engines.

export const VERSION = 15, TPS = 60;
export const FALL_BUFFER = 250;   // so weit (25 m) darf man unter die höchste Kameraposition zurückfallen – solange der Sturm nicht schneller ist
export const RUSH_TICKS = 360, CHECKPOINT = 5000, MOVE_EVERY = 150, MOVE_TICKS = 40;
export const LANES = 11, LANE_W = 120, WORLD_W = LANES * LANE_W, START_LANE = 5;
export const VIEW_W = 400;                              // Mindest-Sichtbreite (Handy hochkant, ~3,3 Bahnen)
export const VIEW_H = 640;                              // sichtbare Welthöhe
export const MEGA_V = [31, 32.5];   // Feder + Rush/Schuhe: +32 % Höhe, mit beidem +45 %
export const G = 0.55, JUMP_V = 15, SPRING_V = 27, DASH_V = 13, SLAM_V = -20;
export const shieldHits = lv => 1 + (lv >= 5 ? 1 : 0) + (lv >= 10 ? 1 : 0);
export const BLESS_SHIELD = 1500, BLESS_JET = 150;   // Himmelssegen: 25 s Schild, 2,5 s Jet
export const SAFE_MAX = 240;   // Nachschutz nach Jetpack/Rush in der Luft: bis zur Landung, höchstens 4 s
// Drohnen-Belohnung: [Extrapunkte, Münzen]. Jede Münze zählt 5 Punkte → Gesamtwert in Klammern.
// Stehend: draufspringen 25, seitlich 50 · Fliegend: draufspringen (50), seitlich – das Schwerste – (100)
// Einfach durchfliegen (Jetpack/Rush/unverwundbar) bringt nur wenig (25).
export const DRONE_REWARD = {
  still:  { stomp: [20, 1], side: [40, 2] },
  moving: { stomp: [40, 2], side: [85, 3] },
  pass: [20, 1],
};
export const droneValue = r => r[0] + r[1] * 5;
export const SWITCH_TICKS = 9;   // Bahnwechsel mit Ease-out: sofort spürbar, weich auslaufend

export const RULES = {
  endless:    { continues: 3 },   // max. 3 Wiederbelebungen pro Lauf: 2× Werbung, 1× Münzen (Aufteilung im Client)
  daily:      { continues: 0 },
  tournament: { continues: 0 },
  // Duell: 90-Sekunden-Rennen. Wer abstürzt, ist nach 2 s wieder dabei (verliert nur Zeit). Am Ende zählt die Höhe.
  duel:       { continues: 0, time: 90 * 60, respawn: 120 },
};
// Duell-Varianten (nur in eigenen Räumen wählbar; das Schnelle Rennen bleibt immer 90 s / Standard):
// time: Rennlänge in Sekunden · ko: nur ein Leben, Sieger ist, wer zuletzt übrig ist · collide: Springer prallen aneinander ab
export const DUEL_TIMES = [60, 90, 120, 180, 300];
export const KO_CAP = 15 * 60 * TPS;   // K.O.: spätestens nach 15 min entscheidet die Höhe
export function duelRules(o = {}) {
  const ko = o.ko === true, collide = o.collide === true;
  const time = ko ? KO_CAP : (DUEL_TIMES.includes(Number(o.time)) ? Number(o.time) : 90) * TPS;
  return { ko, collide, time, sec: ko ? 0 : time / TPS };
}
export const isStdDuel = r => !r || (!r.ko && !r.collide && (r.sec || 90) === 90);
// Kollision: Codes im Eingabestrom (vom eigenen Gerät erkannt, vom Server beim Auswerten nachgeprüft)
//   S<n>   ich lande auf Springer n → kräftiger Abprall nach oben
//   P<n>d  ich ramme Springer n seitlich (d = l/r: in diese Richtung wird er geschoben)
//   k<n>t  ich wurde von n getroffen (t = s: von oben → ich falle durch die nächste Plattform; l/r: eine Bahn weggeschoben)
export const HIT_RE = /^(S[0-7]|P[0-7][lr]|k[0-7][slr])$/;
export const STOMP_V = 20;
// Aufrüstbare Power-ups (Stufe 0–5) – Dauer in Ticks
export const POWER = {
  jet:    { base: 210, per: 30 },
  magnet: { base: 420, per: 90 },
  shield: { base: 600, per: 120 },
  boots:  { base: 360, per: 60 },
};
export const MAX_LEVEL = 15;
export const CHEAP_LEVEL = 5;   // bis hierher volle Wirkung je Stufe (und Truhen-Upgrades); Stufe 6–15 halbe Wirkung, dafür Langzeit-Ziel
// Dauer eines Power-ups in Ticks auf Stufe lv
export function powerDur(kind, lv) {
  const P = POWER[kind], a = Math.min(lv, CHEAP_LEVEL), b = Math.max(0, lv - CHEAP_LEVEL);
  return P.base + P.per * a + Math.floor(P.per * b / 2);
}
// Welten (nur Darstellung, beeinflusst die Simulation nicht).
// Bis 10.000 m: eine feste Reise durch 17 Welten, jede führt erzählerisch in die nächste
// (Stadt → durch Wolken und Gewitter in die Nacht → ins All → zum Mond → durch Galaxien, Eis, Kometen → Wüste, Sonne, Schwarzes Loch → Hyperraum → fremde Stadt).
// Danach je 10.000-m-Abschnitt (nach dem Himmelstor) 9 Welten à ~1.000 m. Die Reihenfolge ist keine Zufallsmischung,
// sondern eine Wanderung über passende Nachbarwelten (NEXT): Es geht immer in eine Welt, die thematisch anschließt,
// und zwar in die, die am längsten nicht dran war. Kommt eine Welt wieder, dann in neuer Farbe mit römischer Ziffer.
// base = Nummer der Hintergrund-Grafik (8 = Himmelstor).
export const BIOMES = [
  { at: 0, name: 'Stadt', base: 0 }, { at: 2500, name: 'Wolken', base: 1 }, { at: 5500, name: 'Gewitterfront', base: 19 }, { at: 8500, name: 'Polarlicht', base: 2 },
  { at: 12000, name: 'Weltall', base: 3 }, { at: 16500, name: 'Mondbasis', base: 20 }, { at: 21500, name: 'Sternennebel', base: 4 }, { at: 27000, name: 'Kristallgalaxie', base: 5 },
  { at: 33000, name: 'Eismond', base: 21 }, { at: 39000, name: 'Kometensturm', base: 11 }, { at: 46000, name: 'Ringplanet', base: 9 }, { at: 53000, name: 'Wüstenplanet', base: 23 },
  { at: 60000, name: 'Sonnenkorona', base: 6 }, { at: 67000, name: 'Schwarzes Loch', base: 10 }, { at: 74000, name: 'Hyperraum', base: 7 }, { at: 81000, name: 'Neonstadt', base: 14 },
  { at: 88000, name: 'Quallenmeer', base: 12 },
];
// Hintergrund-Nummer → Grundname (für die endlosen Abschnitte)
export const WORLD_NAMES = { 1: 'Wolken', 2: 'Polarlicht', 3: 'Weltall', 4: 'Sternennebel', 5: 'Kristallgalaxie', 6: 'Sonnenkorona', 7: 'Hyperraum', 9: 'Ringplanet', 10: 'Schwarzes Loch',
  11: 'Kometensturm', 12: 'Quallenmeer', 13: 'Bonbonwolken', 14: 'Neonstadt', 15: 'Lavaplanet', 16: 'Prismenwelt', 17: 'Uhrwerk-Kosmos', 18: 'Himmelsinseln',
  19: 'Gewitterfront', 20: 'Mondbasis', 21: 'Eismond', 22: 'Pilzwald', 23: 'Wüstenplanet', 24: 'Korallenriff', 25: 'Raumstation', 26: 'Laternenhimmel' };
// Welche Welten zusammenpassen (beide Richtungen). Himmel ↔ Nacht ↔ nahes All ↔ Galaxien ↔ Eis ↔ Feuer ↔ Extreme ↔ Technik ↔ Leben
const LINKS = [
  [1, 19], [1, 13], [1, 18], [19, 2], [19, 26], [13, 18], [18, 26], [26, 2], [13, 24], [18, 22], [26, 14],
  [2, 3], [2, 21], [3, 20], [3, 25], [3, 4], [20, 25], [20, 9], [20, 11], [25, 14], [25, 17], [25, 9],
  [4, 5], [4, 16], [4, 12], [5, 16], [5, 21], [5, 11], [16, 7], [21, 11], [11, 9],
  [9, 23], [23, 15], [23, 6], [15, 6], [6, 10], [15, 17], [10, 7], [10, 4], [7, 14],
  [12, 22], [12, 24], [22, 24], [12, 14], [17, 16], [26, 25], [25, 16],
];
// Erster endloser Abschnitt (nach dem Goldenen Himmelstor): die 9 Welten, die man bis dahin noch nicht kannte – als zusammenhängende Kette
const FIRST_BLOCK = [22, 24, 13, 18, 26, 25, 16, 17, 15];
export const NEXT = {};
for (const [a, b] of LINKS) { (NEXT[a] ||= []).push(b); (NEXT[b] ||= []).push(a); }
const PER_BLOCK = 9, BLOCK_OFF = 9000, BLOCK_LEN = 100000, SLOT = Math.floor((BLOCK_LEN - BLOCK_OFF) / PER_BLOCK);
export const LOOP_AT = BLOCK_LEN + BLOCK_OFF;   // ab 10.900 m (nach dem ersten Himmelstor)
const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
// Endlose Folge: deterministische Wanderung über NEXT. Nie dieselbe Welt zweimal hintereinander, nie zurück in die vorige;
// bevorzugt nie besuchte, dann die am längsten nicht besuchte Nachbarwelt (bei Gleichstand fester Pseudozufall).
const seq = [], last = {}, seenN = {};
for (const b of [...BIOMES.map(w => w.base), ...FIRST_BLOCK]) { last[b] = seq.length; seenN[b] = (seenN[b] || 0) + 1; seq.push({ base: b, seen: seenN[b] - 1 }); }
function walk(n) {
  while (seq.length <= n) {
    const i = seq.length, cur = seq[i - 1].base, prev = seq[i - 2]?.base;
    let best = -1, bestScore = Infinity;
    for (const c of NEXT[cur]) {
      if (c === prev) continue;
      const age = last[c] ?? -1e6, h = (Math.imul(i * 7919 + c * 104729, 2654435761) >>> 0) / 4294967296;
      const score = age + h * .5;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    if (best < 0) best = NEXT[cur][0];
    last[best] = i; seenN[best] = (seenN[best] || 0) + 1;
    seq.push({ base: best, seen: seenN[best] - 1 });
  }
  return seq[n];
}
// Fortlaufende Welt-Nummer (0, 1, 2, … ohne Ende)
export function worldIndexAt(y) {
  if (y < BLOCK_LEN) { let b = 0; for (let i = 0; i < BIOMES.length; i++) if (y >= BIOMES[i].at) b = i; return b; }
  const blk = Math.floor(y / BLOCK_LEN), off = y - blk * BLOCK_LEN - BLOCK_OFF;
  if (off < 0) return blk === 1 ? BIOMES.length - 1 : BIOMES.length + (blk - 1) * PER_BLOCK - 1;   // im Himmelstor: Welt davor
  return BIOMES.length + (blk - 1) * PER_BLOCK + Math.min(PER_BLOCK - 1, Math.floor(off / SLOT));
}
const infoCache = new Map();
export function worldInfo(i) {
  let r = infoCache.get(i); if (r) return r;
  const n = BIOMES.length;
  if (i < n) r = { i, base: BIOMES[i].base, at: BIOMES[i].at, hue: 0, name: BIOMES[i].name };
  else {
    const s = i - n, blk = Math.floor(s / PER_BLOCK) + 1, j = s % PER_BLOCK, w = walk(i), seen = w.seen;
    r = { i, base: w.base, at: blk * BLOCK_LEN + BLOCK_OFF + j * SLOT, hue: seen ? (seen * 67 + w.base * 23) % 360 : 0, name: seen ? `${WORLD_NAMES[w.base]} ${ROMAN[seen] || seen + 1}` : WORLD_NAMES[w.base] };
  }
  if (infoCache.size > 400) infoCache.clear();
  infoCache.set(i, r);
  return r;
}
// Alle 10.000 m (100.000 Einheiten) beginnt für 900 m das Himmelstor – eine besondere Meilenstein-Welt
export const MILESTONE = 100000, SPECIAL_LEN = 9000;
const GATE_NAMES = ['Goldenes Himmelstor', 'Platin-Himmelstor', 'Kristall-Himmelstor', 'Regenbogen-Himmelstor', 'Sternentor'];
export function worldAt(y) {
  const k = Math.floor(y / MILESTONE);
  if (k >= 1 && y - k * MILESTONE < SPECIAL_LEN) return { i: 10000 + k, base: 8, at: k * MILESTONE, hue: 0, name: k <= GATE_NAMES.length ? GATE_NAMES[k - 1] : `Sternentor ${ROMAN[k - GATE_NAMES.length] || k - GATE_NAMES.length + 1}`, special: k };
  return worldInfo(worldIndexAt(y));
}
export function biomeAt(y) { return worldAt(y).base; }

// ---------- RNG ----------
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function rnd(st) {
  st.r = (st.r + 0x6D2B79F5) >>> 0;
  let t = st.r;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (st, n) => Math.floor(rnd(st) * n);

// ---------- Spiel anlegen ----------
// opts.levels: { jet, magnet, shield, boots } 0–5, opts.mult: Missions-Multiplikator 1–30
export function createGame(seedStr, mode = 'endless', opts = {}) {
  if (!RULES[mode]) throw new Error('mode');
  const lv = {};
  for (const k of Object.keys(POWER)) lv[k] = Math.max(0, Math.min(MAX_LEVEL, Math.floor((opts.levels || {})[k] || 0)));
  const mult = Math.max(1, Math.min(30, Math.floor(opts.mult || 1)));
  const headstart = opts.headstart === true && mode === 'endless';
  const R = mode === 'duel' ? { ...RULES.duel, ...duelRules(opts), respawn: opts.ko === true ? 0 : RULES.duel.respawn } : RULES[mode];
  const st = {
    v: VERSION, mode, R, seed: String(seedStr), r: hashSeed(String(seedStr)), levels: lv, mult,
    tick: 0, over: false, cause: '',
    p: { lane: START_LANE, from: START_LANE, sw: SWITCH_TICKS, x: START_LANE, y: 40, vy: JUMP_V, ox: START_LANE, oy: 40, dash: true, drop: 0, dropT: 0, down: 0, jet: headstart ? 240 : 0, magnet: 0, shield: 0, boots: 0, inv: headstart ? 270 : 0, land: 0, rush: 0, safe: 0, hold: false, hits: 0 },
    cam: 0, ocam: 0, camHigh: 0, storm: -380, maxY: 40, coins: 0, gems: 0, score: 0, nextId: 1, lastSolidY: 0, farthest: 0, meter: 0, checkpoints: 0, blessings: 0, headstart,
    plats: [], obst: [], items: [], genY: 0,
    stats: { jumps: 0, springs: 0, dashes: 0, slams: 0, drones: 0, movers: 0, sides: 0, powerups: 0, crumbles: 0, gems: 0, explore: 0, rushes: 0, stomps: 0, stomped: 0 },
    droneScore: 0, continuesUsed: 0, deaths: 0, inputs: [], events: [],
  };
  for (let l = 0; l < LANES; l++) addPlat(st, l, 0, 'n');
  generate(st);
  return st;
}

function addPlat(st, lane, y, type) { st.plats.push({ id: st.nextId++, lane, x: lane, from: lane, mt: MOVE_TICKS, y, type, hit: 0, dir: 1 }); }
// Rush-Leiste füllen; voll → 6 s Rush (Supersprünge, Magnet, doppelte Münzen, unverwundbar gegen Drohnen)
function charge(st, n) {
  if (st.p.rush > 0) return;
  st.meter += n;
  if (st.meter >= 100) { st.meter = 0; st.p.rush = RUSH_TICKS; st.stats.rushes++; st.events.push({ t: 'rush' }); }
}

// Prozedurale Welt. Jede Reihe ist fair: Jede Bahn hat eine Plattform in Reichweite (±1 Bahn, später ±2),
// egal ob sie gerade sichtbar ist. Außen liegen mehr Schätze – und mehr Risiko.
export function generate(st) {
  while (st.genY < Math.max(st.cam, st.camHigh || 0) + VIEW_H + 900) {
    const h = st.genY;
    const gap = Math.min(185, 105 + Math.floor(h / 160) + pick(st, 25));
    st.genY += gap;
    const y = st.genY;
    const reach = h < 3500 ? 1 : 2;
    // Plattform-Bahnen mit lückenloser Abdeckung
    const lanes = [];
    let l = pick(st, reach + 1);
    while (l < LANES) { lanes.push(l); l += 2 + pick(st, 2 * reach); }
    if (lanes[lanes.length - 1] < LANES - 1 - reach) lanes.push(LANES - 1 - pick(st, reach + 1));
    for (const lane of lanes) {
      let type = 'n';
      const r = rnd(st);
      if (r < 0.06) type = 's';                                                       // Feder
      else if (h > 1200 && r < 0.06 + Math.min(0.3, (h - 1200) / 20000)) type = 'c';   // Bröckel
      else if (h > 3000 && r < 0.42 && rnd(st) < 0.25) type = 'm';                      // wandert
      addPlat(st, lane, y, type);
    }
    // Objekte aus früheren Reihen, die in die neuen Plattformen ragen, wieder entfernen
    const rowPlats = st.plats.filter(q => q.y === y);
    const hits = (lane, oy, r) => rowPlats.some(q => (q.type === 'm' || q.lane === lane) && oy + r > q.y - 26 && oy - r < q.y + (q.type === 's' ? 34 : 6));
    st.items = st.items.filter(it => it.got || !hits(it.lane, it.y, SPACE[it.kind]));
    st.obst = st.obst.filter(o => o.dead || !(o.moving ? rowPlats.some(q => o.y + SPACE.drone > q.y - 26 && o.y - SPACE.drone < q.y + 34) : hits(o.lane, o.y, SPACE.drone)));
    const outer = l2 => l2 <= 1 || l2 >= LANES - 2;
    const sideLane = () => (rnd(st) < 0.5 ? pick(st, 2) : LANES - 1 - pick(st, 2));

    // Reihenfolge: Drohnen → Power-ups → Sterne → Münzen. Jedes Objekt bekommt einen freien Platz (keine Überlagerung).
    if (h > 2500) {   // Drohnen ab 250 m – nie über einer Plattform, außen etwas häufiger
      let n = 0;
      for (let k = 0; k < 2; k++) if (rnd(st) < Math.min(0.45, 0.06 + h / 45000)) n += h > 8000 && rnd(st) < 0.35 ? 2 : 1;
      const free = [];
      for (let k = 0; k < LANES; k++) if (!lanes.includes(k)) free.push(k);
      const dy = Math.floor(gap * 0.5);
      for (let i = 0; i < n && free.length; i++) {
        const fi = rnd(st) < 0.5 ? free.findIndex(outer) : -1;
        const idx = fi >= 0 ? fi : pick(st, free.length);
        const lane = free.splice(idx, 1)[0];
        const moving = h > 6000 && rnd(st) < 0.35;
        if (blocked(st, lane, y + dy, SPACE.drone, moving)) continue;
        st.obst.push({ id: st.nextId++, lane, x: lane, ox: lane, y: y + dy, kind: 'drone', moving, dir: rnd(st) < 0.5 ? -1 : 1, t: 0, dead: false });
      }
    }
    if (h > 400 && rnd(st) < 0.06 + Math.min(0.04, h / 2500000)) {   // Power-up, bevorzugt außen; in großer Höhe etwas häufiger
      const kinds = ['jet', 'magnet', 'shield', 'boots'];
      const lane = rnd(st) < 0.6 ? sideLane() : pick(st, LANES), kind = kinds[pick(st, 4)];
      place(st, lane, y + 75, kind);
    }
    if (h > 300 && rnd(st) < 0.22) {   // Stern am Rand mit zwei Begleitmünzen
      const lane = sideLane();
      if (place(st, lane, y + 80, 'gem')) { place(st, lane, y + 30, 'coin'); place(st, lane, y + 130, 'coin'); }
    }
    // Münzen: gut lesbare Muster, die zum Bahnwechsel einladen
    for (let pass = 0; pass < 2; pass++) {
      const cr = rnd(st);
      const base = lanes[pick(st, lanes.length)];
      if (cr < 0.3) {                                   // Säule über der Plattform
        for (let i = 1; i <= 4; i++) place(st, base, y + 18 + i * 32, 'coin');
      } else if (cr < 0.55) {                           // Treppe zur Nachbarbahn
        const dir = base <= 1 ? 1 : base >= LANES - 2 ? -1 : (rnd(st) < 0.5 ? 1 : -1);
        for (let i = 0; i < 4; i++) place(st, base + dir * Math.floor(i / 2 + 0.5), y + 48 + i * 34, 'coin');
      } else if (cr < 0.68) {                           // Bogen über drei Bahnen
        const c0 = Math.min(LANES - 2, Math.max(1, base));
        place(st, c0 - 1, y + 55, 'coin'); place(st, c0, y + 95, 'coin'); place(st, c0 + 1, y + 55, 'coin'); place(st, c0, y + 135, 'coin');
      }
    }
  }
}

// ---------- Freiräume: nichts überlagert sich ----------
// Halbe Höhe der Objekte in Welteinheiten (inkl. Beschriftung/Leuchten)
export const SPACE = { coin: 17, gem: 30, jet: 48, magnet: 48, shield: 48, boots: 48, drone: 36 };
function blocked(st, lane, y, r, wide = false) {
  if (lane < 0 || lane >= LANES) return true;
  for (const it of st.items) {
    if (it.got || Math.abs(it.y - y) >= r + SPACE[it.kind]) continue;
    if (wide || it.lane === lane) return true;
  }
  for (const o of st.obst) {
    if (o.dead || Math.abs(o.y - y) >= r + SPACE.drone) continue;
    if (wide || o.moving || o.lane === lane) return true;   // bewegliche Drohnen belegen ihre ganze Höhe
  }
  for (const pl of st.plats) {
    if (pl.hit < 0) continue;
    const top = pl.y + (pl.type === 's' ? 34 : 6), bottom = pl.y - 26;
    if (y + r <= bottom || y - r >= top) continue;
    if (wide || pl.type === 'm' || pl.lane === lane) return true;   // Wanderplattformen belegen die ganze Reihe
  }
  return false;
}
function place(st, lane, y, kind) {
  if (blocked(st, lane, y, SPACE[kind])) return false;
  st.items.push({ id: st.nextId++, lane, y, kind, got: false });
  return true;
}

// ---------- Eingaben ----------
// 'L' / 'R' Bahnwechsel, 'U' Doppelsprung, 'D' Stampfer
export function input(st, code) {
  if (st.over || st.p.down > 0 || typeof code !== 'string') return false;
  if (st.R.time && st.tick >= st.R.time) return false;   // Schlusspfiff: keine Eingaben mehr
  const p = st.p;
  if (code.length > 1) {
    if (!st.R.collide || !HIT_RE.test(code)) return false;
    if (code[0] === 'S') {
      if (p.vy >= 0 || p.jet > 0) return false;
      p.vy = Math.max(p.vy, STOMP_V); p.dash = true; p.land = 10; st.stats.stomps++;
    } else if (code[0] === 'k') {
      st.stats.stomped++;
      if (p.jet <= 0 && p.rush <= 0) {
        if (code[2] === 's') { p.drop = 1; p.dropT = 70; if (p.vy > -8) p.vy = -8; }
        else { const t = p.lane + (code[2] === 'l' ? -1 : 1); if (t >= 0 && t < LANES) { p.from = p.x; p.lane = t; p.sw = 0; } }
      }
      p.inv = Math.max(p.inv, 20);
    }
    st.inputs.push([st.tick, code]);
    st.events.push({ t: 'hit', code });
    return true;
  }
  if (code.length !== 1 || !'LRUD'.includes(code)) return false;
  if (code === 'L' || code === 'R') {
    const t = p.lane + (code === 'L' ? -1 : 1);
    if (t < 0 || t >= LANES) return false;
    p.from = p.x; p.lane = t; p.sw = 0;   // auch mitten im Wechsel: Ziel verschiebt sich weich weiter
    st.events.push({ t: 'move', dir: code });
  } else if (code === 'U') {
    if (!p.dash || p.jet > 0) return false;
    p.dash = false; if (p.vy < DASH_V) p.vy = DASH_V; st.stats.dashes++;
    st.events.push({ t: 'dash' });
  } else {
    // Runter: durch die nächste Plattform hindurchfallen (eine Ebene tiefer)
    if (p.jet > 0 || p.drop > 0) return false;
    p.drop = 1; p.dropT = 70; if (p.vy > -5) p.vy = -5; st.stats.slams++;
    st.events.push({ t: 'drop' });
  }
  st.inputs.push([st.tick, code]);
  return true;
}

// Zweite Chance (nur Endlos, 1×): Jetpack-Start, Schild, Sturm zurückgedrängt
export function rescue(st) {
  if (!st.over || st.continuesUsed >= st.R.continues) return false;
  const p = st.p;
  st.over = false; st.cause = ''; st.continuesUsed++;
  st.cam = Math.max(st.cam, st.camHigh - 60);
  if (p.y < st.cam + 160) p.y = st.cam + 160;
  p.vy = 0; p.jet = 150; p.shield = 300; p.hits = 1; p.inv = 180; p.dash = true;
  st.storm = st.cam - 900;
  for (const o of st.obst) if (o.y < p.y + 500) o.dead = true;
  st.inputs.push(['c', st.tick]);
  st.events.push({ t: 'rescue' });
  return true;
}

// ---------- Simulation ----------
export function step(st) {
  if (st.over) return;
  const R = st.R;
  if (R.time && st.tick >= R.time) { st.over = true; st.cause = 'time'; st.events.push({ t: 'over', cause: 'time' }); return; }
  const p = st.p;
  p.ox = p.x; p.oy = p.y; st.ocam = st.cam;        // Vorwerte für flüssige Darstellung (Interpolation)
  for (const o of st.obst) o.ox = o.x;
  if (p.down > 0) {                                 // Duell: kurz außer Gefecht, dann Wiedereinstieg
    if (--p.down === 0) respawn(st);
    st.tick++;
    return;
  }

  if (p.sw < SWITCH_TICKS) { p.sw++; const k = 1 - p.sw / SWITCH_TICKS; p.x = p.from + (p.lane - p.from) * (1 - k * k * k); }
  else p.x = p.lane;

  const prevY = p.y;
  if (p.jet > 0) { p.vy = 14; p.jet--; if (p.jet === 0) { p.safe = SAFE_MAX; st.events.push({ t: 'jetEnd' }); } }
  else p.vy -= p.vy > -2.5 && p.vy < 2.5 ? G * 0.65 : G;   // kurzes Schweben am höchsten Punkt
  if (p.dropT > 0 && --p.dropT === 0) p.drop = 0;
  if (p.vy < -24) p.vy = -24;
  p.y += p.vy;
  if (p.magnet > 0) p.magnet--;
  if (p.shield > 0) p.shield--;
  if (p.boots > 0) p.boots--;
  // Nachschutz: Endet Jetpack oder Rush in der Luft, bleibt man geschützt, bis man wieder auf einer Plattform landet (höchstens 4 s)
  if (p.safe > 0) { p.safe--; if (p.inv < 2) p.inv = 2; }
  if (p.inv > 0) p.inv--;
  if (p.land > 0) p.land--;
  // Rush läuft in der Luft weiter (auf dem letzten Tick gehalten) und endet erst mit der nächsten Landung
  if (p.rush > 1) p.rush--;
  else if (p.rush === 1 && !p.hold) { p.hold = true; st.events.push({ t: 'rushHold' }); }

  // Wandernde Plattformen: gleiten alle 2,5 s weich (0,67 s) eine Bahn weiter; am Rand kehren sie um
  for (const pl of st.plats) {
    if (pl.type !== 'm') continue;
    if ((st.tick + pl.id * 13) % MOVE_EVERY === 0) {
      const taken = l => l < 0 || l >= LANES || st.plats.some(q => q !== pl && q.hit >= 0 && q.y === pl.y && (q.lane === l || (q.type === 'm' && q.from === l && q.mt < MOVE_TICKS)));
      if (taken(pl.lane + pl.dir)) pl.dir = -pl.dir;
      if (!taken(pl.lane + pl.dir)) { pl.from = pl.lane; pl.lane += pl.dir; pl.mt = 0; }
    }
    if (pl.mt < MOVE_TICKS) { pl.mt++; const k = pl.mt / MOVE_TICKS; pl.x = pl.from + (pl.lane - pl.from) * k * k * (3 - 2 * k); }
    else pl.x = pl.lane;
  }
  for (const o of st.obst) if (o.moving && !o.dead) {
    o.t++;
    if (o.t % 100 === 0) { if (o.lane + o.dir < 0 || o.lane + o.dir > LANES - 1) o.dir = -o.dir; o.lane += o.dir; }
    o.x += (o.lane - o.x) * 0.12;
  }

  // Landen
  if (p.vy < 0 && p.jet <= 0) {
    for (const pl of st.plats) {
      if (pl.hit < 0) continue;
      if (prevY >= pl.y && p.y < pl.y && Math.abs(p.x - pl.x) < 0.42) {
        if (p.drop > 0) { p.drop--; st.events.push({ t: 'through', y: pl.y, lane: pl.lane, id: pl.id }); continue; }
        p.y = pl.y;
        const spring = pl.type === 's' || p.boots > 0 || p.rush > 0;
        // Sprungfeder + Rush/Sprungschuhe: Kräfte addieren sich gedämpft → Mega-Sprung (etwa ⅓ höher, mit beidem etwas mehr)
        const mega = pl.type === 's' && (p.boots > 0 || p.rush > 0) ? (p.boots > 0 && p.rush > 0 ? 2 : 1) : 0;
        p.vy = mega ? MEGA_V[mega - 1] : spring ? SPRING_V : JUMP_V;
        p.dash = true; p.land = 10; p.safe = 0;
        if (p.rush === 1) { p.rush = 0; p.hold = false; p.inv = Math.max(p.inv, 40); st.events.push({ t: 'rushEnd' }); }
        st.stats.jumps++;
        if (pl.type === 's') st.stats.springs++;
        if (pl.type === 'c') { pl.hit = -1; st.stats.crumbles++; }
        if (mega) st.stats.megas = (st.stats.megas || 0) + 1;
        st.events.push({ t: spring ? 'spring' : 'land', y: pl.y, lane: pl.lane, type: pl.type, id: pl.id, mega });
        break;
      }
    }
  }

  // Sammeln
  for (const it of st.items) {
    if (it.got) continue;
    const near = Math.abs(p.x - it.lane) < 0.5 && Math.abs(p.y + 20 - it.y) < 46;
    const magnet = (it.kind === 'coin' || it.kind === 'gem') && (p.magnet > 0 || p.rush > 0) && Math.abs(p.y - it.y) < 260 && Math.abs(p.x - it.lane) < 2.5;
    if (!near && !magnet) continue;
    it.got = true;
    const x2 = p.rush > 0 ? 2 : 1;
    if (it.kind === 'coin') { st.coins += x2; charge(st, 3); st.events.push({ t: 'coin', lane: it.lane, y: it.y, x2 }); }
    else if (it.kind === 'gem') { st.coins += 10 * x2; st.gems++; st.stats.gems++; charge(st, 20); st.events.push({ t: 'gem', lane: it.lane, y: it.y, x2 }); }
    else {
      const dur = powerDur(it.kind, st.levels[it.kind]);
      p[it.kind] = dur; st.stats.powerups++; charge(st, 10);
      if (it.kind === 'jet') p.inv = Math.max(p.inv, dur + 30);
      if (it.kind === 'shield') p.hits = shieldHits(st.levels.shield);
      st.events.push({ t: 'power', kind: it.kind, dur });
    }
  }

  // Drohnen
  // Besiegen: von oben draufspringen ODER seitlich hineinsprinten (Bahnwechsel auf die Drohne zu).
  // Treffer: von unten hineinsteigen oder wenn eine bewegliche Drohne dich seitlich anfliegt (sie ist schneller auf dich zu als du auf sie).
  const pvx = p.x - p.ox;
  for (const o of st.obst) {
    if (o.dead) continue;
    if (Math.abs(p.x - o.x) < 0.36 && Math.abs(p.y + 20 - o.y) < 32) { // fairer, kleiner Trefferbereich
      const toward = o.x >= p.x ? 1 : -1, mine = pvx * toward, theirs = (o.ox - o.x) * toward;
      const stomp = p.vy < 0 && p.y + 14 >= o.y;
      const side = !stomp && mine > 0.015 && mine >= theirs;
      if (p.jet > 0 || p.inv > 0 || p.rush > 0 || stomp || side) {
        o.dead = true; st.stats.drones++;
        // bewegliche Drohnen sind schwerer zu erwischen → deutlich mehr Belohnung; Seitenhieb gibt extra
        const rw = stomp ? DRONE_REWARD[o.moving ? 'moving' : 'still'].stomp : side ? DRONE_REWARD[o.moving ? 'moving' : 'still'].side : DRONE_REWARD.pass;
        const bonus = rw[1], x2 = p.rush > 0 ? 2 : 1;
        if (o.moving) st.stats.movers++;
        if (side) st.stats.sides++;
        st.coins += bonus * x2; st.droneScore += rw[0];
        charge(st, o.moving ? 25 : 15);
        if (stomp && p.jet <= 0) { p.vy = JUMP_V + 2; p.dash = true; p.land = 10; }
        st.events.push({ t: 'smash', x: o.x, y: o.y, stomp, side, moving: o.moving, coins: bonus * x2, pts: droneValue(rw) });
      } else if (p.shield > 0) {
        // Schild-Stufe zählt: ab Stufe 5 hält er 2 Treffer, ab Stufe 10 drei
        o.dead = true; p.inv = 60; if (--p.hits <= 0) { p.shield = 0; p.hits = 0; } st.events.push({ t: 'shieldHit', x: o.x, y: o.y, left: p.hits });
      } else { die(st, 'drone'); return; }
    }
  }

  // Kamera & Sturm
  if (p.y > st.maxY) {
    st.maxY = p.y;
    // Checkpoint alle 500 m: Münzbonus, der mit jedem Checkpoint wächst
    while (st.maxY >= (st.checkpoints + 1) * CHECKPOINT) {
      st.checkpoints++; const bonus = 10 + st.checkpoints * 5; st.coins += bonus;
      st.events.push({ t: 'checkpoint', n: st.checkpoints, m: st.checkpoints * CHECKPOINT / 10, bonus });
    }
    // Himmelssegen alle 10.000 m: Schild + kurzer Jet-Schub (keine Extra-Leben – max. 3 Wiederbelebungen bleiben) – Belohnung fürs Durchhalten, macht die nächste Etappe machbar
    while (st.maxY >= (st.blessings + 1) * MILESTONE) {
      st.blessings++;
      p.shield = Math.max(p.shield, BLESS_SHIELD); p.hits = Math.max(p.hits, shieldHits(st.levels.shield)); p.jet = Math.max(p.jet, BLESS_JET); p.inv = Math.max(p.inv, BLESS_JET + 30);
      st.storm = Math.min(st.storm, st.cam - 900);
      st.events.push({ t: 'bless', k: st.blessings });
    }
  }
  const off = Math.abs(p.lane - START_LANE); if (off > st.farthest) { st.farthest = off; st.stats.explore = off; }
  const target = p.y - VIEW_H * 0.42;
  if (target > st.cam) st.cam += (target - st.cam) * 0.18;
  else if (p.y < st.cam + 90) {                    // Fall-Puffer: Kamera fällt mit, aber nicht unter Sturm bzw. 25 m unter den Höchststand
    const low = Math.max(st.storm, st.camHigh - FALL_BUFFER), want = Math.max(low, p.y - 90);
    if (want < st.cam) st.cam += (want - st.cam) * 0.22;
  }
  if (st.cam > st.camHigh) st.camHigh = st.cam;
  const stormSpeed = Math.min(3.6, 0.8 + st.tick / (TPS * 80)); // wird stetig schneller
  st.storm += stormSpeed;
  if (st.storm < st.camHigh - 380) st.storm = st.camHigh - 380;
  if (st.storm > st.cam) st.cam = st.storm;

  st.score = (Math.floor(st.maxY / 10) + st.coins * 5 + st.droneScore) * st.mult;
  st.tick++;

  const floor = Math.max(st.storm, st.camHigh - FALL_BUFFER) - 30;
  if (p.y < floor) { die(st, st.storm >= st.camHigh - FALL_BUFFER ? 'storm' : 'fall'); return; }

  if (st.tick % 30 === 0) {
    const low = Math.min(st.cam, st.camHigh - FALL_BUFFER) - 200;
    st.plats = st.plats.filter(x => x.y > low && x.hit >= 0);
    st.items = st.items.filter(x => x.y > low && !x.got);
    st.obst = st.obst.filter(x => x.y > low && !x.dead);
  }
  generate(st);
}

function die(st, cause) {
  const R = st.R;
  if (R.respawn) { st.p.down = R.respawn; st.deaths = (st.deaths || 0) + 1; st.cause = cause; st.events.push({ t: 'down', cause }); return; }
  st.over = true; st.cause = cause;
  st.events.push({ t: 'over', cause });
}
function respawn(st) {
  const p = st.p;
  st.cam = st.ocam = Math.max(st.cam, st.camHigh - 60);
  p.y = p.oy = st.cam + 220; p.x = p.ox = p.lane; p.from = p.lane; p.sw = SWITCH_TICKS;
  p.vy = JUMP_V; p.jet = 0; p.inv = 210; p.shield = 0; p.drop = 0; p.dropT = 0; p.dash = true; p.rush = 0; p.hold = false; p.safe = 0;   // normaler Sprung – Absturz kostet echte Zeit
  st.storm = st.cam - 420;
  for (const o of st.obst) if (o.y < p.y + 520) o.dead = true;
  st.events.push({ t: 'respawn' });
}

// Bahn eines Laufs Tick für Tick (für die Kollisions-Prüfung auf dem Server): x, y, außer Gefecht?
export function makeTrace() { return { x: [], y: [], d: [] }; }
export const traceStep = tr => st => { tr.x[st.tick] = st.p.x; tr.y[st.tick] = st.p.y; tr.d[st.tick] = st.p.down > 0 || st.over ? 1 : 0; };

// ---------- Replay prüfen (Server) ----------
export const MAX_TICKS = TPS * 60 * 30;
// stopAt: nur bis zu diesem Tick rechnen (z. B. wenn jemand im Duell vorzeitig aufgibt)
export function simulate(seed, mode, inputs, opts = {}, stopAt = MAX_TICKS, onStep = null) {
  if (!Array.isArray(inputs) || inputs.length > 40000) return { ok: false, err: 'inputs' };
  const st = createGame(seed, mode, opts);
  let i = 0;
  const end = Math.max(0, Math.min(MAX_TICKS, stopAt));
  for (;;) {
    while (i < inputs.length) {
      const m = inputs[i];
      if (!Array.isArray(m) || m.length !== 2) return { ok: false, err: 'format' };
      if (m[0] === 'c') {
        if (!st.over || m[1] !== st.tick) break;
        if (!rescue(st)) return { ok: false, err: 'rescue' };
        i++; continue;
      }
      if (!Number.isInteger(m[0]) || typeof m[1] !== 'string') return { ok: false, err: 'format' };
      if (m[0] < st.tick) return { ok: false, err: 'order' };
      if (m[0] > st.tick || st.over) break;
      if (!input(st, m[1])) return { ok: false, err: 'illegal' };
      i++;
    }
    if (st.over) {
      const nx = inputs[i];
      if (nx && nx[0] === 'c' && nx[1] === st.tick) continue;
      break;
    }
    if (st.tick >= end) break;   // Eingaben genau am letzten Tick zählen noch (z. B. beim Aufgeben)
    step(st);
    st.events.length = 0;
    if (onStep) onStep(st);
  }
  if (i < inputs.length) return { ok: false, err: 'trailing' };
  return { ok: true, score: st.score, over: st.over, height: Math.floor(st.maxY / 10), coins: st.coins, gems: st.gems, ticks: st.tick, deaths: st.deaths, cause: st.cause, state: st };
}

// ---------- Perioden ----------
export function dayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}
export function seedFor(mode, period) {
  if (mode === 'daily') return `daily-${period}`;
  if (mode === 'tournament') return `tour-${period}`;
  return period;
}
