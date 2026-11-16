// Lauf prüfen (gemeinsam für /api/submit-score und den Tresor): Ticket einlösen, nachrechnen, Zeit/Eingaben prüfen, Rangliste.
import { simulate } from '../../www/core.js';
import { redeem, timeCheck, analyze, flag, isBanned, keepReplay } from './anticheat.mjs';
import { update } from './db.mjs';

const MAX_ENTRIES = 5000;

// → { error, status } oder { sim, mode, period, ranked, best, rank, total, rankable }
export async function verifyRun(uid, player, { ticket, moves, score }) {
  if (!Array.isArray(moves)) return { error: 'moves', status: 400 };
  // Lauf-Ticket: Welt, Aufrüstungen und Startzeit kommen vom Server, nicht aus der Anfrage. Jedes Ticket gilt einmal.
  const t = await redeem(uid, ticket);
  if (t.error) return { error: t.error, status: 409 };
  const { mode, period, seed, opts } = t;

  const sim = simulate(seed, mode, moves, opts);
  if (!sim.ok) { await flag(uid, player.name, 'replay:' + sim.err, { mode }); return { error: 'replay:' + sim.err, status: 422 }; }
  // Echtzeit gegen Spielzeit (Speedhack, Zeitlupe, Sofort-Bots) und Menschenmöglichkeit der Eingaben
  const tc = timeCheck(t.t0, sim.ticks), an = analyze(moves);
  const hard = tc || an.hard;
  if (hard) { await flag(uid, player.name, hard, { mode, h: sim.height, ticks: sim.ticks, real: Math.round((Date.now() - t.t0) / 1000), burst: an.maxBurst }); return { error: 'rejected', why: hard, status: 422 }; }
  const base = { sim, mode, period, seed, opts };
  // Abweichende Punktzahl: Gerät hat anders gerechnet (veränderte Werte) → keine Rangliste; zählen tut nur das Server-Ergebnis
  if (Number(score) !== sim.score) { await flag(uid, player.name, 'score', { mode, sent: Number(score) || 0, real: sim.score }); return { ...base, rankable: false, mismatch: true, rank: null }; }
  const soft = [...an.flags, ...(t.cf || [])];
  const ranked = mode === 'endless' ? sim.height : sim.score;
  // Gesperrte Spieler: Lauf wird angenommen, erscheint aber in keiner Rangliste
  if (await isBanned(uid)) return { ...base, rankable: false, ranked, best: 0, rank: null, total: 0 };

  // Endlos zählt nach Höhe (fair, unabhängig vom Multiplikator), Tages-Run & Turnier nach Punkten
  let rank = null, total = 0, best = ranked;
  await update(`boards/${mode}/${period}`, cur => {
    const board = cur || { entries: [] };
    const list = board.entries;
    const i = list.findIndex(e => e.u === uid);
    if (i >= 0 && list[i].s >= ranked) { best = list[i].s; rank = i + 1; total = list.length; return undefined; }
    if (i >= 0) list.splice(i, 1);
    const entry = { u: uid, n: player.name, c: player.country, s: ranked, h: sim.height, at: Date.now() };
    let pos = list.findIndex(e => e.s < ranked);
    if (pos < 0) pos = list.length;
    list.splice(pos, 0, entry);
    if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
    rank = pos < MAX_ENTRIES ? pos + 1 : null; total = list.length;
    return board;
  });
  // Spitzenläufe und Auffälliges: Replay aufbewahren bzw. vermerken, damit sich alles nachprüfen lässt
  if (rank && rank <= 20 && best === ranked) await keepReplay(mode, period, uid, { seed, opts, moves, score: sim.score, h: sim.height, ticks: sim.ticks, real: Math.round((Date.now() - t.t0) / 1000), at: Date.now() });
  if (soft.length || (rank && rank <= 3 && best === ranked)) await flag(uid, player.name, soft.length ? soft.join(',') : 'top' + rank, { mode, h: sim.height, ticks: sim.ticks, burst: an.maxBurst });
  return { ...base, rankable: true, ranked, best, rank, total };
}
