// SKY DUELL – Fortschritt & Belohnungen (reine Logik, ohne Oberfläche).
// Level/XP, Tagesserie, Tagesaufgaben, Truhen, Glücksrad, Erfolge, Kopfstart-Marken.

export const day = (d = new Date()) => d.toISOString().slice(0, 10);
const prevDay = () => day(new Date(Date.now() - 86400000));
function seeded(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return () => { h = (h + 0x6D2B79F5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function ensure(save) {
  save.xp ??= 0; save.level ??= 1;
  save.streak ??= { day: '', count: 0, claimed: '' };
  save.chests ??= [];
  save.spin ??= { day: '', free: true, ad: true };
  save.tasks ??= { day: '', list: [], bonus: false };
  save.ach ??= {};
  save.tot ??= { runs: 0, coins: 0, height: 0, drones: 0, stars: 0, rushes: 0, best: 0 };
  save.tokens ??= { headstart: 1 };
  save.armed ??= false;
  save.freeCoins ??= { day: '', n: 0 };
  save.style ??= {};
  save.style = { jet: 'classic', trail: 'fire', shoe: 'basic', hat: 'none', land: 'dust', face: 'happy', ...save.style };
  save.ownedStyle ??= ['jet:classic', 'trail:fire', 'shoe:basic'];
  for (const k of ['hat:none', 'land:dust', 'face:happy']) if (!save.ownedStyle.includes(k)) save.ownedStyle.push(k);
  save.pity ??= 0; save.sets ??= {};
  seasonEnsure(save);
  save.duel ??= { wins: 0, played: 0, best: 0 };
  return save;
}

// ---------- Level ----------
export const xpNeed = lvl => 120 + lvl * 60;
export function runXp(g) {
  return Math.floor(g.maxY / 100) + Math.floor(g.coins / 2) + g.stats.drones * 5 + (g.stats.movers || 0) * 5 + g.stats.gems * 10 + g.stats.rushes * 15 + g.checkpoints * 20;
}
export const levelReward = lvl => ({ coins: 100 + lvl * 25, chest: lvl % 25 === 0 ? 'legend' : lvl % 10 === 0 ? 'epic' : lvl % 3 === 0 ? (lvl % 9 === 0 ? 'gold' : 'silver') : null });
export function addXp(save, xp) {
  const ups = [];
  save.xp += xp;
  while (save.xp >= xpNeed(save.level)) {
    save.xp -= xpNeed(save.level); save.level++;
    const r = levelReward(save.level); save.coins += r.coins; if (r.chest) save.chests.push(r.chest);
    ups.push({ level: save.level, ...r });
  }
  return ups;
}

// ---------- Tagesserie (Login-Kalender, 7 Tage) ----------
export const STREAK = [
  { coins: 60 }, { coins: 90 }, { coins: 120 }, { chest: 'bronze' }, { coins: 180 }, { coins: 240, token: 1 }, { chest: 'gold' },
];
export function streakCheck(save) {
  const d = day();
  if (save.streak.day === d) return null;
  save.streak.count = save.streak.day === prevDay() ? save.streak.count + 1 : 1;
  save.streak.day = d;
  return STREAK[(save.streak.count - 1) % 7];
}
export function grant(save, r, factor = 1) {
  if (r.coins) save.coins += r.coins * factor;
  if (r.token) save.tokens.headstart += r.token * factor;
  if (r.chest) for (let i = 0; i < factor; i++) save.chests.push(r.chest);
}

// ---------- Tagesaufgaben ----------
const TASKS = [
  { k: 'heightSum', t: n => `Steige insgesamt ${n} m`, goals: [1500, 2500, 4000] },
  { k: 'coins', t: n => `Sammle ${n} Münzen`, goals: [120, 200, 320] },
  { k: 'drones', t: n => `Besiege ${n} Drohnen`, goals: [2, 4, 6] },
  { k: 'sides', t: n => `Erledige ${n} Drohnen per Seitenhieb`, goals: [1, 3, 5] },
  { k: 'movers', t: n => `Besiege ${n} fliegende Drohnen`, goals: [1, 2, 4] },
  { k: 'runs', t: n => `Spiele ${n} Läufe`, goals: [3, 5, 8] },
  { k: 'stars', t: n => `Sammle ${n} Sterne`, goals: [1, 3, 5] },
  { k: 'rushes', t: n => `Löse ${n}× den Rush aus`, goals: [1, 2, 4] },
  { k: 'heightRun', t: n => `Erreiche ${n} m in einem Lauf`, goals: [600, 1000, 1600] },
  { k: 'checkpoints', t: n => `Erreiche ${n} Checkpoints`, goals: [1, 3, 5] },
  { k: 'duels', t: n => `Fahre ${n} Duell-Rennen`, goals: [1, 2, 3] },
  { k: 'springs', t: n => `Spring ${n}× auf Federn`, goals: [5, 10, 16] },
  { k: 'drops', t: n => `Fall ${n}× durch eine Plattform`, goals: [3, 6, 10] },
  { k: 'powerups', t: n => `Sammle ${n} Power-ups`, goals: [2, 4, 7] },
  { k: 'dashes', t: n => `Mach ${n} Doppelsprünge`, goals: [10, 20, 35] },
  { k: 'crumbles', t: n => `Zerbrich ${n} Bröckel-Plattformen`, goals: [3, 6, 10] },
  { k: 'edge', t: n => n === 1 ? 'Spring bis auf eine äußerste Bahn' : `Spring in ${n} Läufen bis ganz nach außen`, goals: [1, 2, 3] },
];
export function tasksCheck(save) {
  const d = day();
  if (save.tasks.day === d) return;
  const rnd = seeded('tasks-' + d), pool = TASKS.slice(), list = [];
  for (let i = 0; i < 3; i++) { const t = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; list.push({ k: t.k, goal: t.goals[i], prog: 0, claimed: false }); }
  save.tasks = { day: d, list, bonus: false };
}
export const taskText = t => TASKS.find(x => x.k === t.k).t(t.goal);
export const TASK_REWARD = 80, TASK_BONUS = 'silver';
export function tasksProgress(save, g) {
  const v = { heightSum: Math.floor(g.maxY / 10), coins: g.coins, drones: g.stats.drones, sides: g.stats.sides || 0, movers: g.stats.movers || 0, runs: 1, stars: g.stats.gems, rushes: g.stats.rushes, heightRun: Math.floor(g.maxY / 10), checkpoints: g.checkpoints,
    duels: g.mode === 'duel' ? 1 : 0, springs: g.stats.springs, drops: g.stats.slams, powerups: g.stats.powerups, dashes: g.stats.dashes, crumbles: g.stats.crumbles, edge: g.stats.explore >= 5 ? 1 : 0 };
  const done = [];
  for (const t of save.tasks.list) {
    if (t.prog >= t.goal) continue;
    t.prog = t.k === 'heightRun' ? Math.max(t.prog, v.heightRun) : t.prog + (v[t.k] || 0);
    if (t.prog >= t.goal) { t.prog = t.goal; done.push(taskText(t)); }
  }
  return done;
}

// ---------- Truhen ----------
// style: Chance auf ein Style-Teil, rar: welche Seltenheiten möglich sind. Alle Chancen werden im Spiel offen angezeigt.
export const CHEST = {
  bronze: { name: 'Bronze-Truhe', col: '#C77B3A', coins: [80, 160], token: .15, upgrade: 0, style: 0, rar: [] },
  silver: { name: 'Silber-Truhe', col: '#9FB3C8', coins: [180, 320], token: .4, upgrade: .15, style: .12, rar: ['c', 'r'] },
  gold:   { name: 'Gold-Truhe', col: '#FFC83D', coins: [400, 700], token: .8, upgrade: .5, style: .35, rar: ['c', 'r', 'e'] },
  epic:   { name: 'Epische Truhe', col: '#9B4DFF', coins: [700, 1100], token: 1, upgrade: .8, style: .75, rar: ['r', 'e'] },
  legend: { name: 'Legendäre Truhe', col: '#FF6BD6', coins: [1200, 2000], token: 1, upgrade: 1, style: 1, rar: ['e', 'l'] },
};
export const PITY = 4;   // spätestens jede 4. Gold-/Epische/Legendäre Truhe enthält garantiert ein Style-Teil
export function rollChest(type, levels, maxLevel, rnd = Math.random) {
  const c = CHEST[type], out = { coins: Math.round(c.coins[0] + rnd() * (c.coins[1] - c.coins[0])), token: 0, upgrade: null };
  if (rnd() < c.token) out.token = 1;
  if (rnd() < c.upgrade) { const open = Object.keys(levels).filter(k => levels[k] < maxLevel); if (open.length) out.upgrade = open[Math.floor(rnd() * open.length)]; }
  return out;
}

// ---------- Saison-Pfad (kostenlos, jeden Monat neu) ----------
// Saisonpunkte gibt es für Höhe (1 je 100 m, max. 12 pro Lauf), Duell-Platzierungen und Tagesaufgaben.
// 100 Stufen: die ersten gehen schnell (fast jeder Lauf bringt eine kleine Belohnung), später werden sie länger.
// Ab 150 💠 am Tag zählen Punkte nur noch halb – so ist der Pass nicht nach zwei Tagen durch, aber jeder Tag lohnt sich.
export const SEASON_TIERS = 100, SEASON_DAY_SOFT = 150;
export const tierCost = t => 8 + Math.floor((t - 1) / 10) * 3;          // 8, 11, 14 … 35 💠 je Stufe (gesamt 2150)
const TIER_START = [0]; for (let t = 1; t <= SEASON_TIERS; t++) TIER_START[t] = TIER_START[t - 1] + tierCost(t);
export const seasonKey = (d = new Date()) => d.toISOString().slice(0, 7);
export const seasonIndex = (key = seasonKey()) => { const [y, m] = key.split('-').map(Number); return (y * 12 + m) % 2; };
// Exklusive Teile je Saison (wechseln sich ab) – Stufe 25, 50, 75, 100
export const SEASON_ITEMS = [['hat:comet', 'shoe:aurora', 'trail:aurora', 'jet:phoenix'], ['land:fireworks', 'shoe:comet', 'trail:comet', 'hat:astro']];
export function seasonEnsure(save) {
  const k = seasonKey();
  if (!save.season || save.season.key !== k) save.season = { key: k, pts: 0, claimed: 0, v: 2 };
  if (save.season.v !== 2) { save.season.v = 2; save.season.claimed = Math.min(save.season.claimed, seasonTier(save.season)); }   // Umstellung auf 100 Stufen
  return save.season;
}
export function seasonReward(tier, key = seasonKey()) {
  if (tier % 25 === 0) return { item: SEASON_ITEMS[seasonIndex(key)][tier / 25 - 1], chest: tier === 100 ? 'legend' : 'epic' };
  if (tier % 10 === 0) return { chest: 'gold', coins: 150 + tier * 5 };
  if (tier % 5 === 0) return { chest: 'silver' };
  if (tier % 3 === 0) return { coins: 60 + tier * 4, token: 1 };
  if (tier % 7 === 0) return { chest: 'bronze' };
  return { coins: 50 + tier * 4 };
}
export const seasonTier = s => { let t = 0; while (t < SEASON_TIERS && s.pts >= TIER_START[t + 1]) t++; return t; };
// Fortschritt innerhalb der aktuellen Stufe (für die Leiste)
export const seasonProgress = s => { const t = seasonTier(s); return t >= SEASON_TIERS ? { tier: t, into: 1, need: 1 } : { tier: t, into: s.pts - TIER_START[t], need: tierCost(t + 1) }; };
export const runSeasonPts = g => Math.min(12, Math.floor(g.maxY / 1000));
export function addSeason(save, pts) {
  const s = seasonEnsure(save), before = seasonTier(s), d = day();
  if (s.day !== d) { s.day = d; s.dayPts = 0; }
  let p = Math.max(0, Math.round(pts));
  const full = Math.max(0, Math.min(p, SEASON_DAY_SOFT - s.dayPts));
  p = full + Math.ceil((p - full) / 2);
  s.dayPts += p; s.pts += p;
  return { pts: p, tiers: seasonTier(s) - before };
}
export const seasonDaysLeft = () => { const d = new Date(), end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); return Math.max(1, Math.ceil((end - d) / 86400000)); };

// ---------- Wochenturnier & Tages-Run ----------
// Die drei Besten der Woche bekommen ihren Preis vom Server – nach Wochenende (So. 24 Uhr UTC) plus Prüfzeit, einmal je Woche.
// Gesperrte Spieler zählen nicht; wer dadurch aufrückt, bekommt den Platz.
export const TOUR_PRIZES = [
  { coins: 3000, chest: 'legend', token: 2, item: 'hat:laurel' },
  { coins: 1500, chest: 'epic', token: 1 },
  { coins: 800, chest: 'gold' },
];
export const TOUR_SETTLE = 6 * 3600e3;
// Ende der laufenden Turnierwoche (Montag 0 Uhr UTC)
export function tourEnd(d = new Date()) { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); t.setUTCDate(t.getUTCDate() + (8 - (t.getUTCDay() || 7))); return t.getTime(); }
// Tages-Run: wird nach Tagesende (24 Uhr UTC + Prüfzeit) nach Platzierung ausgewertet und beim nächsten Start ausgezahlt.
// Jeder, der in der Tages-Rangliste steht, bekommt etwas – je besser, desto mehr.
export const DAILY_SETTLE = 3600e3;
export const DAILY_TIERS = [
  { id: 'p1', coins: 500, chest: 'gold' },
  { id: 'p2', coins: 300, chest: 'silver' },
  { id: 'p3', coins: 200, chest: 'silver' },
  { id: 'top', coins: 150, chest: 'silver' },   // Top 10 %
  { id: 'all', coins: 100, chest: 'bronze' },   // dabei gewesen
];
export const topCut = total => Math.max(3, Math.ceil(total * .1));
export function dailyTier(rank, total) { return rank <= 3 ? DAILY_TIERS[rank - 1] : rank <= topCut(total) ? DAILY_TIERS[3] : DAILY_TIERS[4]; }
export function dayEnd(d = new Date()) { return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); }

// ---------- Glücksrad ----------
export const WHEEL = [
  { label: '50', coins: 50, col: '#FFC83D' }, { label: '🚀', token: 1, col: '#38C6FF' }, { label: '100', coins: 100, col: '#FF5A7A' },
  { label: '🎁', chest: 'bronze', col: '#3BE8A4' }, { label: '150', coins: 150, col: '#B25CFF' }, { label: '30', coins: 30, col: '#FF8A2B' },
  { label: '🎁', chest: 'silver', col: '#7FD3FF' }, { label: '300', coins: 300, col: '#FFE066' },
];
export const WHEEL_WEIGHTS = [22, 10, 18, 10, 12, 20, 5, 3];
export function spinPick(rnd = Math.random) {
  let r = rnd() * WHEEL_WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < WHEEL.length; i++) { r -= WHEEL_WEIGHTS[i]; if (r <= 0) return i; }
  return 0;
}
export function spinCheck(save) { const d = day(); if (save.spin.day !== d) save.spin = { day: d, free: true, ad: true }; }

// ---------- Erfolge ----------
const tiers = (id, name, stat, steps, unit = '') => steps.map((n, i) => ({ id: `${id}${i}`, name: `${name} ${['I', 'II', 'III', 'IV'][i]}`, desc: `${n.toLocaleString('de-DE')}${unit}`, unit, stat, n, reward: 100 * (i + 1) * (i + 1) }));
export const ACH = [
  ...tiers('best', 'Himmelsstürmer', 'best', [500, 1000, 2000, 4000], ' m in einem Lauf'),
  ...tiers('coin', 'Sparschwein', 'coins', [1000, 10000, 50000, 200000], ' Münzen gesammelt'),
  ...tiers('dro', 'Drohnenjäger', 'drones', [10, 50, 200, 1000], ' Drohnen besiegt'),
  ...tiers('run', 'Dauerhüpfer', 'runs', [10, 100, 500, 2000], ' Läufe gespielt'),
  ...tiers('star', 'Sternsammler', 'stars', [10, 100, 500, 2000], ' Sterne gefunden'),
  ...tiers('rush', 'Im Rausch', 'rushes', [5, 50, 250, 1000], '× Rush ausgelöst'),
  ...tiers('leg', 'Legende', 'best', [6000, 10000, 20000, 50000], ' m in einem Lauf'),
  ...tiers('spr', 'Federkönig', 'springs', [50, 250, 1000, 5000], '× auf Federn gesprungen'),
  ...tiers('drp', 'Durchfaller', 'drops', [20, 100, 500, 2000], '× durch Plattformen gefallen'),
  ...tiers('dul', 'Duellant', 'duels', [5, 25, 100, 500], ' Duell-Rennen gefahren'),
  ...tiers('chp', 'Champion', 'duelWins', [1, 10, 50, 200], ' Duelle gewonnen'),
  ...tiers('col', 'Sammler', 'styles', [5, 15, 30, 45], ' Style-Teile gesammelt'),
  ...tiers('upg', 'Tüftler', 'upgrades', [10, 25, 45, 60], ' Power-up-Stufen insgesamt'),
  ...tiers('sid', 'Seitenhieb', 'sides', [5, 50, 250, 1000], ' Drohnen seitlich erledigt'),
  ...tiers('mov', 'Jagdflieger', 'movers', [5, 40, 200, 800], ' fliegende Drohnen besiegt'),
  ...tiers('sea', 'Saison-Held', 'seasonTier', [10, 25, 50, 100], ' Saison-Stufen in einer Saison'),
];
// Werte, die nicht direkt in save.tot stehen
const STAT = {
  duelWins: s => s.duel?.wins || 0, duels: s => s.duel?.played || 0,
  styles: s => (s.ownedStyle || []).filter(k => !['jet:classic', 'trail:fire', 'shoe:basic', 'hat:none', 'land:dust', 'face:happy'].includes(k)).length,
  upgrades: s => Object.values(s.levels || {}).reduce((a, b) => a + b, 0),
  seasonTier: s => seasonTier(seasonEnsure(s)),
};
const statOf = (save, k) => (STAT[k] ? STAT[k](save) : save.tot[k] || 0);
export function achCheck(save) {
  const got = [];
  for (const a of ACH) if (!save.ach[a.id] && statOf(save, a.stat) >= a.n) { save.ach[a.id] = true; save.coins += a.reward; got.push(a); }
  return got;
}
export const achProgress = (save, a) => Math.min(1, statOf(save, a.stat) / a.n);
export function totals(save, g) {
  const t = save.tot;
  t.runs++; t.coins += g.coins; t.height += Math.floor(g.maxY / 10); t.drones += g.stats.drones; t.stars += g.stats.gems; t.rushes += g.stats.rushes;
  t.springs = (t.springs || 0) + g.stats.springs; t.drops = (t.drops || 0) + g.stats.slams;
  t.sides = (t.sides || 0) + (g.stats.sides || 0); t.movers = (t.movers || 0) + (g.stats.movers || 0);
  t.best = Math.max(t.best, Math.floor(g.maxY / 10));
}

// Was wartet auf den Spieler? (für rote Punkte im Menü)
export function pending(save) {
  return {
    chests: save.chests.length,
    season: Math.max(0, seasonTier(seasonEnsure(save)) - save.season.claimed),
    spin: save.spin.day !== day() || save.spin.free,
    tasks: save.tasks.list.filter(t => t.prog >= t.goal && !t.claimed).length + (save.tasks.list.length && save.tasks.list.every(t => t.claimed) && !save.tasks.bonus ? 1 : 0),
  };
}
