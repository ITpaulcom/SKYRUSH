// GET /api/health → prüft, ob Server und Speicher (Netlify Blobs) funktionieren
import { json, preflight, store } from '../lib/db.mjs';

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  try {
    await store().setJSON('health', { at: Date.now() });
    return json({ ok: true, storage: true }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return json({ ok: false, storage: false, error: String(e && e.message || e) }, 500);
  }
};
export const config = { path: '/api/health' };
