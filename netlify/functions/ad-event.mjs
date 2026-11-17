// POST /api/ad-event  { uid, secret, format, micros, currency, estimated }
// Summiert Werbeeinnahmen pro Tag (in 16 Teil-Dokumenten, damit sich gleichzeitige Spieler nicht blockieren).
import { json, preflight, auth, update, validUid } from '../lib/db.mjs';

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const b = await req.json().catch(() => ({}));
  if (b.diag && typeof b.diag === 'object') return diagEvent(b);
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

// Werbe-Diagnose der Geräte (für die Zentrale): warum gibt es keine Anzeigen?
const clip = (v, n = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
async function diagEvent(b) {
  if (!validUid(b.uid)) return json({ error: 'params' }, 400);
  if (!(await auth(b.uid, b.secret))) return json({ error: 'auth' }, 401);
  const d = b.diag, day = new Date().toISOString().slice(0, 10);
  const row = { at: Date.now(), u: b.uid.slice(0, 8), pf: clip(d.platform, 10), v: clip(b.app, 20), consent: clip(d.consent, 60), can: d.canRequest === true ? 1 : d.canRequest === false ? 0 : null,
    init: clip(d.init, 80), loads: Math.min(999, +d.loads || 0), fails: Math.min(999, +d.fails || 0), err: clip(d.err), shown: Math.min(999, +d.shown || 0), house: Math.min(999, +d.house || 0), web: clip(d.web, 30), test: !!b.test };
  await update(`addiag/${day}`, cur => {
    const o = cur || { rows: [] };
    o.rows = [row, ...o.rows.filter(r => !(r.u === row.u && row.at - r.at < 6 * 3600e3 && r.pf === row.pf))].slice(0, 80);
    return o;
  });
  return json({ ok: true });
}
export const config = { path: '/api/ad-event' };
