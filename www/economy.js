// SKY RUSH – Spielökonomie: Münzen, Käufe, Freischaltungen, Belohnungen.
// Dieselben Regeln laufen auf dem Gerät (sofortige Anzeige) und auf dem Server (verbindlich).
// Der Server hält den echten Spielstand („Tresor“): Das Gerät schickt nur Aktionen („kaufe X“, „Lauf mit diesen Eingaben“),
// der Server prüft und rechnet sie mit seinen eigenen Werten nach. Was auf dem Gerät verändert wird, zählt nicht.
// Zufall (Truhen, Glücksrad) würfelt nur der Server.
import * as M from './meta.js';
import * as C from './core.js';
import { CHARS, STYLE, SETS, UPGRADE_COST, MISSIONS, PACKS } from './catalog.js';
import { CONFIG } from './config.js';

// Diese Felder gehören zum Tresor (Server ist maßgeblich). Alles andere (Name, Ton, Steuerung, gewählte Figur …) bleibt auf dem Gerät.
export const ECON_KEYS = ['coins', 'owned', 'ownedStyle', 'levels', 'mult', 'missions', 'chests', 'tokens', 'xp', 'level', 'streak', 'spin', 'tasks', 'ach', 'tot',
  'freeCoins', 'pity', 'sets', 'season', 'duel', 'milestone', 'bestH', 'best', 'lastH', 'games', 'iapTx', 'adc', 'lastRun', 'lastChest', 'starter', 'dprize', 'trophies', 'dwins'];
const eco = () => ({ rescueCoinPrice: 500, headstartPrice: 300, freeCoins: 100, freeCoinsPerDay: 3, ...(CONFIG.economy || {}) });
// Tagesgrenzen für Belohnungen per Werbevideo (wer schummelt, bekommt höchstens, was ein ehrlicher Spieler mit Videos bekäme)
export const AD_LIMITS = { double: 30, chest: 30, head: 5, streak: 1, spin: 1 };
// Läufe ohne Server-Ticket (offline gestartet): werden nachgerechnet, aber nur begrenzt gutgeschrieben
export const OFFLINE = { runs: 20, coins: 4000 };
const POWERS = Object.keys(C.POWER);
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
const fail = code => { const e = new Error(code); e.code = code; throw e; };
const DEFAULT_STYLE = ['jet:classic', 'trail:fire', 'shoe:basic', 'hat:none', 'land:dust', 'face:happy'];
export const styleItem = key => { const [cat, k] = String(key).split(':'); return STYLE[cat]?.items[k] ? { cat, k, it: STYLE[cat].items[k] } : null; };

// ---------- Grundzustand / Bereinigung ----------
export function ensure(s) {
  s.coins = int(s.coins, 0, 1e9);
  s.owned = [...new Set(['hops', ...(Array.isArray(s.owned) ? s.owned : [])])].filter(k => CHARS[k]);
  const lv = s.levels && typeof s.levels === 'object' ? s.levels : {}; s.levels = {}; for (const k of POWERS) s.levels[k] = int(lv[k], 0, C.MAX_LEVEL);
  s.mult = int(s.mult, 1, 30) || 1;
  for (const k of ['bestH', 'best', 'lastH', 'games', 'milestone']) s[k] = int(s[k], 0, 1e9);
  M.ensure(s);
  s.ownedStyle = [...new Set([...DEFAULT_STYLE, ...s.ownedStyle.filter(x => styleItem(x))])];
  s.chests = s.chests.filter(c => M.CHEST[c]);
  s.tokens.headstart = int(s.tokens.headstart, 0, 1e6);
  if (!Array.isArray(s.missions) || s.missions.length !== 3) s.missions = newMissions(s);
  s.iapTx ??= []; s.adc ??= { day: '', n: {} }; s.lastRun ??= null; s.lastChest ??= null;
  s.dprize = typeof s.dprize === 'string' ? s.dprize.slice(0, 10) : '';
  s.dwins = (Array.isArray(s.dwins) ? s.dwins : []).filter(w => w && typeof w.d === 'string').slice(0, 10);
  const tr = s.trophies && typeof s.trophies === 'object' ? s.trophies : {};
  s.trophies = { g: int(tr.g, 0, 1e4), s: int(tr.s, 0, 1e4), b: int(tr.b, 0, 1e4), wins: (Array.isArray(tr.wins) ? tr.wins : []).filter(w => w && typeof w.p === 'string').slice(0, 12) };
  unlockHeight(s);
  return s;
}
// Tägliche Dinge (Tagesserie, Aufgaben, Glücksrad, Saison) auf den heutigen Tag stellen
export function housekeeping(s) { M.streakCheck(s); M.tasksCheck(s); M.spinCheck(s); M.seasonEnsure(s); if (s.adc.day !== M.day()) s.adc = { day: M.day(), n: {} }; }
const ad = (s, k) => { housekeeping(s); const n = s.adc.n[k] || 0; if (n >= AD_LIMITS[k]) fail('limit'); s.adc.n[k] = n + 1; };

// ---------- Missionen ----------
export function newMissions(s) {
  const pool = MISSIONS.slice(), out = [];
  let seed = s.mult * 7919 + 13;
  while (out.length < 3) { seed = (seed * 16807) % 2147483647; const m = pool.splice(seed % pool.length, 1)[0]; out.push({ k: m.k, goal: m.base + m.step * (s.mult - 1), prog: 0 }); }
  return out;
}
export function progressMissions(s, g) {
  const done = [];
  for (const m of s.missions) {
    if (m.prog >= m.goal) continue;
    const def = MISSIONS.find(x => x.k === m.k); if (!def) continue;
    const v = { height: Math.floor(g.maxY / 10), coins: g.coins, springs: g.stats.springs, drones: g.stats.drones, dashes: g.stats.dashes, powerups: g.stats.powerups, coinsRun: g.coins, runs: 1, gems: g.stats.gems, explore: g.stats.explore, rushes: g.stats.rushes,
      drops: g.stats.slams, crumbles: g.stats.crumbles, checkpoints: g.checkpoints, checkRun: g.checkpoints, duels: g.mode === 'duel' ? 1 : 0, sides: g.stats.sides || 0, movers: g.stats.movers || 0 }[m.k] || 0;
    m.prog = def.run ? Math.max(m.prog, v) : m.prog + v;
    if (m.prog >= m.goal) { m.prog = m.goal; done.push({ k: m.k, goal: m.goal }); }
  }
  let levelUp = false;
  if (s.missions.every(m => m.prog >= m.goal) && s.mult < 30) { s.mult++; s.missions = newMissions(s); levelUp = true; }
  return { done, levelUp };
}
// Höhen-Figuren (Aurum, Platina, Kristallo): gibt es nur für den Rekord
export function unlockHeight(s) {
  const got = [];
  for (const [k, c] of Object.entries(CHARS)) if (c.unlock && s.bestH >= c.unlock && !s.owned.includes(k)) { s.owned.push(k); got.push(k); }
  return got;
}
// Himmelstore (10.000 m, 20.000 m …): beim ersten Erreichen Legendäre Truhe(n) und Münzen
function milestones(s, g) {
  const k = Math.floor(g.maxY / C.MILESTONE), got = [];
  for (let i = s.milestone + 1; i <= k; i++) { s.chests.push('legend'); if (i >= 3) s.chests.push('legend'); s.coins += 5000 * i; got.push(i); }
  if (k > s.milestone) s.milestone = k;
  return got;
}

// ---------- Truhen ----------
function rollStyle(s, type, rnd) {
  const c = M.CHEST[type];
  if (!c.style) return null;
  const big = ['gold', 'epic', 'legend'].includes(type), owns = (cat, k) => s.ownedStyle.includes(cat + ':' + k);
  const forced = big && s.pity + 1 >= M.PITY;
  if (!forced && rnd() >= c.style) { if (big) s.pity++; return null; }
  const all = Object.entries(STYLE).flatMap(([cat, cc]) => Object.entries(cc.items).filter(([k, it]) => !it.season && it.price > 0 && !owns(cat, k)).map(([k, it]) => ({ cat, k, rar: it.rar })));
  let pool = all.filter(x => c.rar.includes(x.rar));
  if (!pool.length) pool = all;
  if (!pool.length) { s.coins += 500; return null; }   // alles gesammelt → Münzen statt Teil
  const w = { c: 5, r: 3, e: 1.6, l: 1 }, tot = pool.reduce((a, x) => a + w[x.rar], 0);
  let r = rnd() * tot, f = pool[0];
  for (const x of pool) { r -= w[x.rar]; if (r <= 0) { f = x; break; } }
  s.ownedStyle.push(f.cat + ':' + f.k); if (big) s.pity = 0;
  return { cat: f.cat, k: f.k };
}
function openOne(s, rnd, want = null) {
  if (!s.chests.length) fail('nochest');
  const at = want && M.CHEST[want] ? s.chests.indexOf(want) : -1;
  const type = at > 0 ? s.chests.splice(at, 1)[0] : s.chests.shift(), loot = M.rollChest(type, s.levels, C.CHEAP_LEVEL, rnd);
  loot.type = type; loot.style = rollStyle(s, type, rnd);
  s.coins += loot.coins; s.tokens.headstart += loot.token;
  if (loot.upgrade && s.levels[loot.upgrade] < C.CHEAP_LEVEL) s.levels[loot.upgrade]++; else loot.upgrade = null;
  return loot;
}
// Pakete haben festen Inhalt. Ist das Style-Teil schon da, gibt es stattdessen die angegebenen Münzen (auch fest).
const grantPack = (s, pk) => {
  s.coins += pk.coins || 0; s.tokens.headstart += pk.headstarts || 0;
  if (pk.chest) s.chests.push(pk.chest);   // nur noch für Gutschriften sehr alter Käufe
  if (pk.item) { if (!s.ownedStyle.includes(pk.item)) s.ownedStyle.push(pk.item); else s.coins += pk.itemCoins || 0; }
  if (pk.once) s.starter = true;
};
export const packOf = id => ((CONFIG.iap && CONFIG.iap.packs) || PACKS).find(p => p.id === id) || PACKS.find(p => p.id === id);

// ---------- Aktionen ----------
// env: { rnd } – Zufallsquelle (nur Truhen/Glücksrad), { run } – Endstand eines Laufs (auf dem Server: der nachgerechnete)
export function apply(s, a, env = {}) {
  const rnd = env.rnd || Math.random, E = eco();
  switch (a.t) {
    case 'run': {
      const g = env.run, m = a.mode, h = Math.floor(g.maxY / 10), quit = !!a.quit;
      s.games++;
      let record = false;
      if (m === 'endless') { s.lastH = h; if (h > s.bestH && s.bestH > 0) record = true; s.bestH = Math.max(s.bestH, h); s.best = Math.max(s.best, g.score); }
      // Wiederbelebung: 2× per Video, 1× mit Münzen. Die dritte muss die Münz-Wiederbelebung sein.
      const rescues = g.continuesUsed || 0, need = Math.max(0, rescues - 2), paid = Math.max(need, Math.min(int(a.coinRev, 0, 1), rescues));
      s.coins += g.coins; s.coins = Math.max(0, s.coins - paid * E.rescueCoinPrice);
      const prevBest = m === 'endless' && !record ? s.bestH : 0;
      const ms = progressMissions(s, g);
      M.tasksCheck(s);
      const tasksDone = quit ? [] : M.tasksProgress(s, g);
      M.totals(s, g);
      const xp = M.runXp(g), lvlBefore = s.level, xpBefore = s.xp, ups = M.addXp(s, xp);
      const se = quit ? { pts: 0, tiers: 0 } : M.addSeason(s, M.runSeasonPts(g));
      const gates = milestones(s, g), figs = unlockHeight(s), achs = M.achCheck(s).map(x => ({ id: x.id, name: x.name, reward: x.reward }));
      s.lastRun = { coins: g.coins, doubled: false };
      return { record, prevBest, h, coins: g.coins, ms, tasksDone, xp, ups, lvlBefore, xpBefore, se, gates, figs, achs };
    }
    case 'duel': {
      const g = env.run, myH = Math.floor(g.maxY / 10), kind = a.kind === 'live' ? 'live' : 'train';
      const place = int(a.place, 1, 4), n = int(a.n, 1, 4), tie = !!a.tie, win = place === 1 && !tie && n > 1;
      const today = M.day();
      if (s.duel.day !== today) { s.duel.day = today; s.duel.prizes = 0; }
      let bonus = 10;
      if (myH >= 50 && s.duel.prizes < 15) { s.duel.prizes++; const table = kind === 'live' ? [120, 60, 35, 20] : [40, 20, 12, 8]; bonus = tie && place === 1 ? Math.round(table[0] * .7) : table[place - 1] || 10; }
      s.duel.played++; if (win && kind === 'live') s.duel.wins++;
      s.duel.best = Math.max(s.duel.best, myH);
      if (g.cause === 'time' && a.std !== false) s.duel.rating = s.duel.rating ? Math.round(s.duel.rating * .7 + myH * .3) : myH;
      s.games++;
      s.coins += g.coins + bonus;
      const ms = progressMissions(s, g);
      M.tasksCheck(s); const tasksDone = M.tasksProgress(s, g); M.totals(s, g);
      const xp = M.runXp(g) + (win ? 40 : 10), ups = M.addXp(s, xp), achs = M.achCheck(s).map(x => ({ id: x.id, name: x.name, reward: x.reward }));
      const se = M.addSeason(s, M.runSeasonPts(g) + (place === 1 ? 3 : place === 2 ? 2 : 1));
      s.lastRun = null;
      return { place, tie, win, bonus, coins: g.coins, ms, tasksDone, xp, ups, achs, se };
    }
    // --- Käufe mit Münzen ---
    case 'buyChar': {
      const c = CHARS[a.k]; if (!c || c.unlock || c.hidden) fail('item'); if (s.owned.includes(a.k)) fail('owned'); if (s.coins < c.price) fail('coins');
      s.coins -= c.price; s.owned.push(a.k); return {};
    }
    case 'buyStyle': {
      const it = STYLE[a.cat]?.items[a.k]; if (!it || it.season || it.hidden || !(it.price > 0)) fail('item');
      const key = a.cat + ':' + a.k; if (s.ownedStyle.includes(key)) fail('owned'); if (s.coins < it.price) fail('coins');
      s.coins -= it.price; s.ownedStyle.push(key); return { achs: M.achCheck(s).map(x => ({ id: x.id, name: x.name, reward: x.reward })) };
    }
    case 'upgrade': {
      if (!POWERS.includes(a.k)) fail('item'); const lv = s.levels[a.k]; if (lv >= C.MAX_LEVEL) fail('max');
      const cost = UPGRADE_COST[lv]; if (s.coins < cost) fail('coins');
      s.coins -= cost; s.levels[a.k]++; return { level: s.levels[a.k], achs: M.achCheck(s).map(x => ({ id: x.id, name: x.name, reward: x.reward })) };
    }
    case 'buyHead': { if (s.coins < E.headstartPrice) fail('coins'); s.coins -= E.headstartPrice; s.tokens.headstart++; return {}; }
    case 'set': {
      const st = SETS.find(x => x.id === a.id); if (!st) fail('item'); if (s.sets[st.id]) fail('owned');
      if (!st.parts.every(x => s.ownedStyle.includes(x))) fail('incomplete');
      s.sets[st.id] = true; s.coins += st.coins; return { coins: st.coins };
    }
    // --- Belohnungen ---
    case 'season': {
      const sn = M.seasonEnsure(s), tier = M.seasonTier(sn), got = { coins: 0, token: 0, chests: [], items: [] };
      if (tier <= sn.claimed) fail('none');
      for (let t = sn.claimed + 1; t <= tier; t++) {
        const r = M.seasonReward(t, sn.key);
        if (r.coins) got.coins += r.coins; if (r.token) got.token += r.token; if (r.chest) { got.chests.push(r.chest); s.chests.push(r.chest); }
        if (r.item && !s.ownedStyle.includes(r.item)) { s.ownedStyle.push(r.item); got.items.push(r.item); }
      }
      s.coins += got.coins; s.tokens.headstart += got.token; sn.claimed = tier;
      return got;
    }
    case 'streak': {
      housekeeping(s);
      if (s.streak.claimed === s.streak.day) fail('claimed');
      const f = a.double ? 2 : 1; if (a.double) ad(s, 'streak');
      const r = M.STREAK[(s.streak.count - 1) % 7]; M.grant(s, r, f); s.streak.claimed = s.streak.day;
      return { coins: (r.coins || 0) * f, token: (r.token || 0) * f, chest: r.chest || null, chests: r.chest ? f : 0 };
    }
    case 'task': {
      M.tasksCheck(s); const t = s.tasks.list[int(a.i, 0, 9)];
      if (!t || t.claimed || t.prog < t.goal) fail('task');
      t.claimed = true; s.coins += M.TASK_REWARD; const ups = M.addXp(s, 25), se = M.addSeason(s, 3);
      return { coins: M.TASK_REWARD, ups, se };
    }
    case 'taskBonus': {
      M.tasksCheck(s); if (s.tasks.bonus || !s.tasks.list.length || !s.tasks.list.every(t => t.claimed)) fail('task');
      s.tasks.bonus = true; s.chests.push(M.TASK_BONUS); return { chest: M.TASK_BONUS };
    }
    case 'chest': {
      if (a.all) { const n = s.chests.length, list = []; if (!n) fail('nochest'); while (s.chests.length) list.push(openOne(s, rnd)); s.lastChest = null; return { list, achs: M.achCheck(s).map(x => ({ id: x.id, name: x.name, reward: x.reward })) }; }
      const loot = openOne(s, rnd, a.type); s.lastChest = { coins: loot.coins, token: loot.token, doubled: false };
      return { loot, achs: M.achCheck(s).map(x => ({ id: x.id, name: x.name, reward: x.reward })) };
    }
    case 'spin': {
      M.spinCheck(s);
      if (!a.ad) { if (!s.spin.free) fail('used'); s.spin.free = false; }
      else { if (s.spin.free || !s.spin.ad) fail('used'); ad(s, 'spin'); s.spin.ad = false; }
      const idx = M.spinPick(rnd); M.grant(s, M.WHEEL[idx]);
      return { idx };
    }
    // --- Belohnungen per freiwilligem Werbevideo (mit Tagesgrenze) ---
    case 'adDouble': { const lr = s.lastRun; if (!lr || lr.doubled || !(lr.coins > 0)) fail('none'); ad(s, 'double'); lr.doubled = true; s.coins += lr.coins; return { coins: lr.coins }; }
    case 'adChest': { const lc = s.lastChest; if (!lc || lc.doubled) fail('none'); ad(s, 'chest'); lc.doubled = true; s.coins += lc.coins; s.tokens.headstart += lc.token; return { coins: lc.coins, token: lc.token }; }
    case 'adFree': {
      if (s.freeCoins.day !== M.day()) s.freeCoins = { day: M.day(), n: 0 };
      if (s.freeCoins.n >= E.freeCoinsPerDay) fail('limit');
      s.freeCoins.n++; s.coins += E.freeCoins; return { coins: E.freeCoins };
    }
    case 'adHead': { ad(s, 'head'); s.tokens.headstart++; return {}; }
    // Turnierpreis / Tagesauswertung wurde angezeigt (nur ein Merker, keine Belohnung)
    case 'tourSeen': { const w = s.trophies.wins.find(x => x.p === a.p); if (!w) fail('none'); w.seen = true; return {}; }
    case 'dailySeen': { const w = s.dwins.find(x => x.d === a.d); if (!w) fail('none'); w.seen = true; return {}; }
    // --- Echtgeld-Kauf (auf dem Server über RevenueCat geprüft, env.iap = bestätigte Pakete) ---
    case 'iap': {
      const pk = packOf(a.pack); if (!pk || !a.tx) fail('item');
      if (s.iapTx.includes(a.tx)) fail('dup');
      s.iapTx.push(String(a.tx).slice(0, 80)); if (s.iapTx.length > 500) s.iapTx.shift();
      const had = pk.item ? s.ownedStyle.includes(pk.item) : false; grantPack(s, pk); return { coins: (pk.coins || 0) + (had ? pk.itemCoins || 0 : 0), chest: pk.chest || null, item: pk.item && !had ? pk.item : null, headstarts: pk.headstarts || 0 };
    }
  }
  fail('action');
}
// Wochenturnier: Preis für Platz 1–3 gutschreiben. Nur der Server ruft das auf (nicht über apply erreichbar).
export function tourGrant(s, place, period) {
  const pz = M.TOUR_PRIZES[place - 1]; if (!pz) return null;
  s.coins += pz.coins; s.chests.unshift(pz.chest); s.tokens.headstart += pz.token || 0;   // Preis-Truhe vorne: „Truhe öffnen“ öffnet genau sie
  let item = null;
  if (pz.item && styleItem(pz.item) && !s.ownedStyle.includes(pz.item)) { s.ownedStyle.push(pz.item); item = pz.item; }
  const tr = s.trophies; tr['gsb'[place - 1]]++;
  const win = { p: period, pl: place, coins: pz.coins, chest: pz.chest, token: pz.token || 0, item, seen: false };
  tr.wins.unshift(win); if (tr.wins.length > 12) tr.wins.length = 12;
  return win;
}
// Tages-Run: Auswertung nach Tagesende gutschreiben. Nur der Server ruft das auf.
export function dailyGrant(s, day, rank, total) {
  const t = M.dailyTier(rank, total);
  s.coins += t.coins; s.chests.unshift(t.chest);
  const win = { d: day, r: rank, n: total, tier: t.id, coins: t.coins, chest: t.chest, seen: false };
  s.dwins.unshift(win); if (s.dwins.length > 10) s.dwins.length = 10;
  return win;
}
// Kopfstart wird beim Start eines Laufs verbraucht (auf dem Server beim Lauf-Ticket)
export function useHeadstart(s) { if (s.tokens.headstart > 0) { s.tokens.headstart--; return true; } return false; }
// Nur die Tresor-Felder (für die Übertragung)
export const econOf = s => Object.fromEntries(ECON_KEYS.filter(k => s[k] !== undefined).map(k => [k, s[k]]));
// ---------- Spielstand aus einer früheren Version / von einem neuen Gerät übernehmen ----------
// Was das Gerät mitbringt, ist nicht überprüfbar. Darum gilt ein Rahmen, der mit dem Rekord wächst, den der Server BELEGEN kann
// (Rangliste, aufbewahrte Replays): Ehrliche Langzeit-Spieler behalten alles, ausgedachte Schätze ohne Beleg werden gekürzt.
// Ganz neue Konten (gerade erst angelegt) bekommen nur einen kleinen Rahmen – ihr Fortschritt kommt ohnehin über die Aktionen.
export const trustBudget = (h, fresh = false) => (fresh ? 5000 : 20000 + 8 * h);   // Münzen / Aufrüstungen; Sammlung bis zum Doppelten
export const multCap = (h, fresh = false) => (fresh ? 5 : Math.min(30, 5 + Math.floor(h / 1000)));
// Rekord: bis 9.999 m wird dem Gerät geglaubt, darüber nur so weit, wie der Server es belegen kann (Höhen-Figuren hängen daran)
export const trustedHeight = (claimed, proven) => Math.max(proven, Math.min(claimed, Math.max(9999, proven)));
const charValue = k => (CHARS[k]?.unlock ? 0 : CHARS[k]?.price || 0);
const styleValue = k => styleItem(k)?.it.price || 0;
const levelCost = lv => UPGRADE_COST.slice(0, lv).reduce((a, b) => a + b, 0);
const levelsCost = lv => POWERS.reduce((a, k) => a + levelCost(lv[k]), 0);
export function migrate(src, { proven = 0, fresh = false } = {}) {
  const s = ensure(structuredClone(econOf(src || {})));
  const notes = [];
  const h = trustedHeight(s.bestH, proven);
  if (h < s.bestH) notes.push('h:' + s.bestH);
  s.bestH = h; s.milestone = Math.min(s.milestone, Math.floor(proven / 10000));
  s.owned = s.owned.filter(k => !CHARS[k].unlock || h >= CHARS[k].unlock);
  const B = trustBudget(proven, fresh);
  if (s.coins > B) { notes.push('coins:' + s.coins); s.coins = B; }
  // Sammlung: was in den Rahmen passt, bleibt (in der Reihenfolge, in der es dazukam)
  let left = 2 * B, cut = 0;
  const keep = v => { if (v <= left) { left -= v; return true; } cut += v; return false; };
  s.owned = s.owned.filter(k => keep(charValue(k)));
  s.ownedStyle = s.ownedStyle.filter(k => DEFAULT_STYLE.includes(k) || keep(styleValue(k)));
  if (cut) notes.push('items:' + cut);
  // Aufrüstungen: die höchste Stufe zuerst kürzen, bis die Kosten in den Rahmen passen
  const before = { ...s.levels };
  while (levelsCost(s.levels) > B) { const k = POWERS.reduce((m, x) => (s.levels[x] > s.levels[m] ? x : m)); s.levels[k]--; }
  if (POWERS.some(k => s.levels[k] < before[k])) notes.push('lv:' + POWERS.map(k => before[k]).join('.'));
  if (s.mult > multCap(proven, fresh)) { notes.push('mult:' + s.mult); s.mult = multCap(proven, fresh); s.missions = newMissions(s); }
  const cc = 5 + 2 * Math.floor(proven / 10000);
  if (s.chests.length > cc) { notes.push('chests:' + s.chests.length); s.chests.length = cc; }
  if (s.tokens.headstart > (fresh ? 5 : 10)) s.tokens.headstart = fresh ? 5 : 10;
  s.iapTx = []; s.adc = { day: '', n: {} };
  s.trophies = { g: 0, s: 0, b: 0, wins: [] }; s.dwins = []; s.ownedStyle = s.ownedStyle.filter(k => !styleItem(k)?.it.tour);
  return { s: ensure(s), notes };
}

// ---------- Wiederherstellung ----------
// Bis Version 2.0.0 hat die Übernahme zu hart gekürzt: Rekord auf 9.999 m (→ Aurum, Platina, Kristallo weg), Münzen auf 5.000,
// Sammlung ab 30.000 Münzen Wert komplett gelöscht, Aufrüstungen auf Stufe 3, Multiplikator auf ×5.
// Einmal je Spieler wird das zurückgeholt – soweit der Server es belegen kann:
//   notes = was damals gekürzt wurde · proven = belegter Rekord (Rangliste/Replay) · rep = Aufrüstungen des aufbewahrten Spitzenlaufs
//   wear = Figur/Ausrüstung, die das Gerät gerade trägt (kommt sofort zurück, wenn sie zur gelöschten Sammlung gehört)
export function repair(s, { notes = [], proven = 0, rep = null, wear = null, fresh = false } = {}) {
  const got = { h: 0, chars: [], items: [], coins: 0, levels: false, mult: 0 };
  const note = p => { const n = notes.find(x => String(x).split(':')[0] === p); return n === undefined ? null : Number(String(n).split(':')[1]) || 0; };
  if (proven > s.bestH) { got.h = proven; s.bestH = proven; }
  const ms = Math.floor(s.bestH / 10000); if (ms > s.milestone) s.milestone = ms;     // Tor-Belohnungen gab es damals schon – nicht doppelt
  got.chars = unlockHeight(s);
  // Rahmen nach BELEGTEM Rekord; Konten, die beim Umzug gerade erst angelegt waren, bekommen nichts erstattet (nichts davon war belegt)
  const B = trustBudget(proven, fresh);
  let refund = fresh ? 0 : Math.max(0, (note('coins') || 0) - 5000);
  let items = fresh ? 0 : note('items') || 0;
  if (note('items') !== null && !fresh) {
    // Saison-Belohnungen der laufenden Saison sind belegt (abgeholte Stufen) → kommen direkt zurück
    const sn = M.seasonEnsure(s);
    for (let t = 25; t <= sn.claimed; t += 25) { const it = M.seasonReward(t, sn.key).item; if (it && !s.ownedStyle.includes(it)) { s.ownedStyle.push(it); got.items.push(it); } }
    // Getragenes direkt zurück (nur Kaufbares, verrechnet mit dem gelöschten Wert)
    const want = [];
    if (wear && CHARS[wear.char] && !CHARS[wear.char].unlock && !s.owned.includes(wear.char)) want.push([s.owned, wear.char, charValue(wear.char)]);
    if (wear && wear.style && typeof wear.style === 'object') for (const [cat, k] of Object.entries(wear.style).slice(0, 8)) { const key = cat + ':' + k; if (styleItem(key) && !s.ownedStyle.includes(key)) want.push([s.ownedStyle, key, styleValue(key)]); }
    for (const [list, k, v] of want) if (v > 0 && v <= items) { items -= v; list.push(k); got.items.push(k); }
    refund += items;   // der Rest als Münzen – damit lässt sich alles wieder kaufen
  }
  got.coins = Math.min(refund, 2 * B); s.coins += got.coins;
  // Aufrüstungen / Multiplikator: höchstens so hoch wie beim aufbewahrten Spitzenlauf, im Rahmen des Rekords
  if (rep && rep.levels && note('lv') !== null && !fresh) {
    const target = {}; for (const k of POWERS) target[k] = Math.max(s.levels[k], int(rep.levels[k], 0, C.MAX_LEVEL));
    let up = true;
    while (up) { up = false; for (const k of POWERS) if (s.levels[k] < target[k]) { s.levels[k]++; if (levelsCost(s.levels) > B) s.levels[k]--; else { up = got.levels = true; } } }
  }
  if (rep && note('mult') !== null && !fresh) { const m = Math.min(int(rep.mult, 1, 30), multCap(proven)); if (m > s.mult) { got.mult = m; s.mult = m; s.missions = newMissions(s); } }
  got.any = !!(got.h || got.chars.length || got.items.length || got.coins || got.levels || got.mult);
  return got;
}

// ---------- Reparatur 3: Aufrüstungen (Gadget-Stufen) aus der Übernahme ----------
// Bei der Übernahme auf den Server wurden Stufen gekürzt und bei der ersten Reparatur nur zurückgegeben, wenn ein Spitzenlauf
// aufbewahrt war. Jetzt kommen sie zurück: bis zu den Stufen, die das Gerät bei der Übernahme hatte (Vermerk „lv:…“),
// bei alten Vermerken ohne Werte mindestens so viele, wie der Erfolg „Tüftler“ belegt. Wer danach schon nachgekauft hat,
// bekommt diese Münzen erstattet. Rahmen: wächst mit dem belegten Rekord (großzügig, aber kein „alles auf 15“ ohne Beleg).
export const levelCap = h => 60000 + 40 * h;
const capLevels = (lv, cap, floor) => { const o = { ...lv }; while (levelsCost(o) > cap) { const k = POWERS.filter(x => o[x] > floor[x]).reduce((m, x) => (m === null || o[x] > o[m] ? x : m), null); if (k === null) break; o[k]--; } return o; };
export function repairLevels(s, { notes = [], proven = 0, rep = null, fresh = false } = {}) {
  const got = { levels: null, from: null, coins: 0 };
  const n = notes.find(x => String(x).split(':')[0] === 'lv');
  if (fresh || n === undefined) return got;
  const vals = String(n).split(':')[1], now = { ...s.levels };
  let target = {};
  if (vals) { const a = vals.split('.'); POWERS.forEach((k, i) => (target[k] = int(a[i], 0, C.MAX_LEVEL))); }
  else {
    target = { ...now };
    const need = s.ach.upg3 ? 60 : s.ach.upg2 ? 45 : s.ach.upg1 ? 25 : s.ach.upg0 ? 10 : 0;
    let sum = POWERS.reduce((x, k) => x + target[k], 0);
    while (sum < need) { const k = POWERS.reduce((m, x) => (target[x] < target[m] ? x : m)); if (target[k] >= C.MAX_LEVEL) break; target[k]++; sum++; }
  }
  if (rep && rep.levels) for (const k of POWERS) target[k] = Math.max(target[k], int(rep.levels[k], 0, C.MAX_LEVEL));
  // Stand direkt nach der Übernahme (bis 2.0.0: höchstens Stufe 3 bzw. wie beim Spitzenlauf; danach: im Rahmen gekürzt)
  const base = vals ? capLevels(target, trustBudget(proven), Object.fromEntries(POWERS.map(k => [k, 0])))
    : Object.fromEntries(POWERS.map(k => [k, Math.min(target[k], Math.max(3, rep && rep.levels ? int(rep.levels[k], 0, C.MAX_LEVEL) : 0))]));
  const cap = levelCap(proven);
  target = capLevels(target, cap, now);
  let refund = 0;
  for (const k of POWERS) { const hi = Math.min(now[k], target[k]); if (hi > base[k]) refund += levelCost(hi) - levelCost(base[k]); }
  refund = Math.min(refund, cap);
  const next = Object.fromEntries(POWERS.map(k => [k, Math.max(now[k], target[k])]));
  if (POWERS.some(k => next[k] > now[k])) { got.levels = next; got.from = now; s.levels = next; }
  if (refund > 0) { got.coins = refund; s.coins += refund; }
  return got;
}
