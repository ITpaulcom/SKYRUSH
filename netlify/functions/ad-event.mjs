// POST /api/ad-event  { uid, secret, format, micros, currency, estimated }
// Summiert Werbeeinnahmen pro Tag (in 16 Teil-Dokumenten, damit sich gleichzeitige Spieler nicht blockieren).
import { json, preflight, auth, update, validUid } from '../lib/db.mjs';

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const b = await req.json().catch(() => ({}));
  const format = ['rewarded', 'interstitial', 'banner'].includes(b.format) ? b.format : null;
  const micros = Math.round(Number(b.micros));
  if (!format || !Number.isFinite(micros) || micros < 0 || micros > 50000000 || !validUid(b.uid)) return json({ error: 'params' }, 400);
  if (!(await auth(b.uid, b.secret))) return json({ error: 'auth' }, 401);
  const day = new Date().toISOString().slice(0, 10), shard = parseInt(b.uid.slice(0, 2), 16) % 16;
  const currency = /^[A-Z]{3}$/.test(b.currency || '') ? b.currency : 'USD';
  const placement = /^[a-z_]{1,24}$/.test(b.placement || '') ? b.placement : format;
  await update(`rev/${day}/${shard}`, cur => {
    const d = cur || { f: {}, users: {}, currency };
    const f = d.f[format] || (d.f[format] = { n: 0, micros: 0, est: 0 });
    f.n++; f.micros += micros; if (b.estimated) f.est += micros;
    d.users[b.uid] = (d.users[b.uid] || 0) + micros;
    d.p = d.p || {}; const pl = d.p[placement] || (d.p[placement] = { n: 0, micros: 0 }); pl.n++; pl.micros += micros;
    return d;
  });
  return json({ ok: true });
};
export const config = { path: '/api/ad-event' };
