// POST /api/player  { uid, secret, name, country }  → Spieler anlegen oder umbenennen
import { json, preflight, auth, cleanName, update } from '../lib/db.mjs';
import { dayKey, weekKey } from '../../www/core.js';

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const b = await req.json().catch(() => ({}));
  if (b.name !== undefined && cleanName(b.name).length < 3) return json({ error: 'name' }, 400);
  const p = await auth(b.uid, b.secret, { name: b.name, country: b.country });
  if (!p) return json({ error: 'auth' }, 401);
  // Neuen Namen auch in den aktuellen Ranglisten anzeigen
  if (b.name !== undefined) {
    await Promise.all([['daily', dayKey()], ['tournament', weekKey()], ['endless', 'all']].map(([m, per]) =>
      update(`boards/${m}/${per}`, cur => {
        const e = cur && cur.entries.find(x => x.u === b.uid);
        if (!e || (e.n === p.name && e.c === p.country)) return undefined;
        e.n = p.name; e.c = p.country; return cur;
      }).catch(() => {})));
  }
  return json({ ok: true, name: p.name, country: p.country });
};
export const config = { path: '/api/player' };
