// GET /api/config – Einstellungen aus der Zentrale für App und Website (Werbung, Werbe-Anbieter, Google-Anmeldung).
// Öffentlich lesbar (enthält nichts Geheimes), kurz zwischengespeichert, damit sie Netlify kaum belastet.
import { json, preflight } from '../lib/db.mjs';
import { publicCfg } from '../lib/appcfg.mjs';

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  try {
    return json(await publicCfg(), 200, { 'Cache-Control': 'public, max-age=60', 'Netlify-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' });
  } catch { return json({ ads: {}, google: { clientId: '' }, v: 0 }, 200, { 'Cache-Control': 'no-store' }); }
};
export const config = { path: '/api/config' };
