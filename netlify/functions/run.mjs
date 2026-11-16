// POST /api/run  { uid, secret, action }
//   action 'seed'  → { seed }            Welt für den nächsten Endlos-Lauf (bis zum Start immer dieselbe)
//   action 'begin' { id, mode, seed, opts } → { ok }   Lauf-Ticket: Startzeit, Welt und Aufrüstungen stehen ab jetzt fest
import { json, preflight, auth } from '../lib/db.mjs';
import { nextSeed, begin } from '../lib/anticheat.mjs';

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const raw = await req.text();
  if (raw.length > 4000) return json({ error: 'size' }, 413);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: 'json' }, 400); }
  const player = await auth(b.uid, b.secret);
  if (!player) return json({ error: 'auth' }, 401);
  try {
    if (b.action === 'seed') return json({ ok: true, seed: await nextSeed(b.uid) });
    if (b.action === 'begin') { const r = await begin(b.uid, b); return r.error ? json({ error: r.error }, r.status || 400) : json(r); }
  } catch (e) { return json({ error: 'busy' }, 503); }
  return json({ error: 'action' }, 400);
};
export const config = { path: '/api/run' };
