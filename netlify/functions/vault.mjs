// POST /api/vault  { uid, secret, init?, actions: [{ id, t, … }] }  →  { rev, econ, results }
// Tresor-Abgleich: Das Gerät schickt seine Aktionen, der Server rechnet sie verbindlich nach und schickt den echten Stand zurück.
import { json, preflight, auth } from '../lib/db.mjs';
import { sync } from '../lib/vault.mjs';
import { isBanned } from '../lib/anticheat.mjs';
import { standings, roomKey, runKey } from './duel.mjs';

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const raw = await req.text();
  if (raw.length > 2500000) return json({ error: 'size' }, 413);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: 'json' }, 400); }
  const player = await auth(b.uid, b.secret);
  if (!player) return json({ error: 'auth' }, 401);
  try {
    const r = await sync(b.uid, player, b, { standings, roomKey, runKey });
    if (await isBanned(b.uid)) r.banned = true;
    return json(r);
  } catch (e) { return json({ error: 'busy' }, 503); }
};
export const config = { path: '/api/vault' };
