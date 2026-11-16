// POST /api/submit-score  { uid, secret, ticket, moves, score }
// Spielt den Lauf mit demselben Spielkern nach. Nur geprüfte Ergebnisse landen in der Rangliste.
// (Die App meldet Läufe inzwischen über /api/vault – dort werden sie zusätzlich gutgeschrieben.)
import { verifyRun } from '../lib/runs.mjs';
import { json, preflight, auth } from '../lib/db.mjs';

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const raw = await req.text();
  if (raw.length > 700000) return json({ error: 'size' }, 413);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: 'json' }, 400); }
  const player = await auth(b.uid, b.secret);
  if (!player) return json({ error: 'auth' }, 401);
  const r = await verifyRun(b.uid, player, b);
  if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.status || 400);
  if (r.mismatch) return json({ error: 'score-mismatch', server: r.sim.score }, 422);
  return json({ ok: true, score: r.sim.score, ranked: r.ranked, best: r.best, rank: r.rank, total: r.total });
};
export const config = { path: '/api/submit-score' };
