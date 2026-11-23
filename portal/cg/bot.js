// SKY DUELL – Trainings-Bot für Duelle, wenn gerade kein Mensch online ist.
// Spielt mit denselben Regeln und Eingaben wie ein Mensch (nur L/R/U/D über C.input), sieht aber nur,
// was ein Spieler auch sehen könnte. „skill“ 0–1 bestimmt Reaktionszeit und Fehlerquote.
import * as C from './core.js';

export function makeBot(skill = 0.5, seed = 1) {
  let r = seed >>> 0 || 1;
  const rand = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
  let cool = 0, plan = null;
  return function think(st) {
    if (st.over || st.p.down > 0) return null;
    const p = st.p;
    if (cool > 0) { cool--; return null; }
    // Schwächere Bots „trödeln“ zwischendurch wie Anfänger (reagieren eine Weile gar nicht)
    if (skill < 0.6 && rand() < (0.6 - skill) * (0.6 - skill) * 0.06) { cool = 50 + Math.floor(rand() * 150); return null; }
    if (p.sw < C.SWITCH_TICKS) return null;
    const apex = p.vy > 0 ? p.y + (p.vy * p.vy) / (2 * C.G) : p.y;
    const danger = (lane, y0, y1) => st.obst.some(o => !o.dead && Math.abs(o.x - lane) < 0.7 && o.y > y0 && o.y < y1);
    // Ziel: höchste erreichbare Plattform (±2 Bahnen), Federn bevorzugt, Drohnen gemieden
    let best = null, bestV = -1e9;
    for (const pl of st.plats) {
      if (pl.hit < 0) continue;
      const dl = Math.abs(pl.lane - p.lane);
      if (dl > 2) continue;
      if (pl.y > apex - 8 || pl.y < st.cam + 20) continue;
      if (p.vy < 0 && pl.y > p.y) continue;
      let v = pl.y - dl * 25;
      if (pl.type === 's') v += 120;
      if (pl.type === 'c') v -= 30;
      if (pl.type === 'm') v -= 15;
      if (danger(pl.lane, pl.y - 40, pl.y + 220)) v -= 400;
      v += (rand() - 0.5) * 60 * (1 - skill);
      if (v > bestV) { bestV = v; best = pl; }
    }
    // Sammelt gern Münzen/Power-ups in der Nachbarbahn, wenn es nichts kostet
    if (best && best.lane === p.lane && rand() < 0.04 * skill) {
      const it = st.items.find(i => !i.got && Math.abs(i.lane - p.lane) === 1 && i.y > p.y && i.y < apex);
      if (it && st.plats.some(q => q.hit >= 0 && q.lane === it.lane && q.y < apex - 8 && q.y > st.cam + 20)) plan = it.lane;
    }
    const target = plan ?? best?.lane;
    plan = null;
    // Reaktionszeit: schwächere Bots zögern länger
    const react = 0.02 + skill * 0.22;
    if (rand() < (1 - skill) * 0.012) { cool = 4; return rand() < 0.5 ? (p.lane > 0 ? 'L' : 'R') : (p.lane < C.LANES - 1 ? 'R' : 'L'); }   // menschliche Fehler
    if (target != null && target !== p.lane && rand() < react) {
      cool = Math.floor(2 + rand() * 8 * (1 - skill));
      return target < p.lane ? 'L' : 'R';
    }
    // Kein Halt unter mir? Doppelsprung als Rettung
    if (p.vy < -4 && p.dash && !st.plats.some(q => q.hit >= 0 && Math.abs(q.x - p.x) < 0.45 && q.y < p.y && q.y > st.cam + 10)) {
      if (rand() < 0.03 + skill * 0.3) { cool = 10; return 'U'; }
    }
    // Drohne direkt über mir beim Steigen → ausweichen
    if (p.vy > 0 && danger(p.lane, p.y, p.y + 160) && rand() < 0.3 + skill * 0.5) {
      cool = 6; return p.lane > 0 && (p.lane === C.LANES - 1 || rand() < 0.5) ? 'L' : 'R';
    }
    return null;
  };
}

// Kompletten Bot-Lauf vorausberechnen (z. B. für die Endwertung)
export function runBot(seed, skill, maxTicks = C.TPS * 60 * 8, bseed = C.hashSeed(seed), opts = {}, onStep = null) {
  const st = C.createGame(seed, 'duel', opts), think = makeBot(skill, bseed);
  while (!st.over && st.tick < maxTicks) { const c = think(st); if (c) C.input(st, c); C.step(st); st.events.length = 0; if (onStep) onStep(st); }
  return st;
}

// Gemessene Bot-Stärke im 90-s-Duell: Stärke → typische Höhe (m). Daraus wird die passende Stärke für ein Ziel-Niveau berechnet.
export const BOT_TABLE = [[0, 570], [.1, 770], [.2, 1035], [.3, 1320], [.4, 1675], [.5, 2005], [.6, 2100]];
export function skillFor(targetH) {
  const T = BOT_TABLE;
  if (targetH <= T[0][1]) return 0;
  for (let i = 1; i < T.length; i++) if (targetH <= T[i][1]) { const [s0, h0] = T[i - 1], [s1, h1] = T[i]; return s0 + (s1 - s0) * (targetH - h0) / (h1 - h0); }
  return .6;
}
// Bots rund um das Niveau der Spieler: einer etwas schwächer, einer gleich, einer etwas stärker
export const BOT_SPREAD = { 1: [1], 2: [.9, 1.1], 3: [.85, 1, 1.15] };
