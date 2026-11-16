// GET /api/leaderboard?mode=daily&period=2026-10-21&uid=…  → Top 100 + eigener Rang
import { json, preflight, store } from '../lib/db.mjs';

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  const q = new URL(req.url).searchParams;
  const mode = q.get('mode'), period = q.get('period'), uid = q.get('uid');
  if (!['endless', 'daily', 'tournament'].includes(mode) || !/^[\w-]{1,20}$/.test(period || '')) return json({ error: 'params' }, 400);
  const board = (await store().get(`boards/${mode}/${period}`, { type: 'json' })) || { entries: [] };
  const top = board.entries.slice(0, 100).map(e => ({ user_id: e.u, name: e.n, country: e.c, score: e.s, height: e.h }));
  const i = uid ? board.entries.findIndex(e => e.u === uid) : -1;
  return json({ top, me: i >= 0 ? { rank: i + 1, total: board.entries.length, score: board.entries[i].s } : null }, 200, { 'Cache-Control': 'public, max-age=15' });
};
export const config = { path: '/api/leaderboard' };
