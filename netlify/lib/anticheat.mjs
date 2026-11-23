// SKY DUELL – Anti-Cheat (Server). Grundsatz: Der Server glaubt dem Gerät nichts.
// 1) Lauf-Ticket: Welt (Seed), Aufrüstungen und Startzeit legt der Server VOR dem Lauf fest – nachträglich nichts änderbar,
//    kein Aussuchen leichter Welten, jedes Ticket gilt genau einmal.
// 2) Replay: Jeder Lauf wird mit dem Spielkern nachgerechnet (submit-score / duel) – erfundene Punkte sind unmöglich.
// 3) Zeitprüfung: Ein Lauf mit T Ticks muss in echter Zeit etwa T/60 s gedauert haben (gegen Speedhack, Zeitlupe, Sofort-Bots).
// 4) Eingabe-Analyse: übermenschliche Eingabefolgen werden abgelehnt, Auffälliges für die Zentrale vermerkt.
// 5) Versuche (Tages-Run, Turnier) zählt der Server. Gesperrte Spieler erscheinen in keiner Rangliste (Shadow-Ban).
import { TPS, RULES, POWER, MAX_LEVEL, dayKey, weekKey, seedFor } from '../../www/core.js';
import { store, update } from './db.mjs';
import { ticketOpts } from './vault.mjs';

export const LIMITS = {
  beginGapMs: 1500,          // Mindestabstand zwischen zwei Lauf-Starts
  beginsPerDay: 500,         // mehr Starts schafft kein Mensch an einem Tag
  daily: 2,                  // 1 Versuch + 1 Reserve (App-Absturz direkt beim Start)
  tournament: 6,             // 2 frei + 1 per Video, mit Reserve
  ticketTtlMs: 3 * 3600e3,   // ein Lauf (max. 30 min Spielzeit) samt Pausen
  fast: .9, fastSlackMs: 5000,        // schneller als Echtzeit → Speedhack/Bot
  slow: 2.5, slowSlackMs: 20 * 60e3,  // viel langsamer → Zeitlupe (Pausen und schwache Geräte bleiben erlaubt)
  burstHard: 20, burstSoft: 13,       // Eingaben in 1 Sekunde: ab hart = abgelehnt, ab weich = vermerkt
};
const rid = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const validId = s => typeof s === 'string' && /^[a-f0-9]{16,32}$/.test(s);
const tKey = (uid, id) => `ac/t/${uid}/${id}`;
const pKey = uid => `ac/p/${uid}`;

// Aufrüstungen auf gültige Werte bringen (genau das, was der Spielkern ohnehin annimmt)
export function cleanOpts(mode, o) {
  if (mode !== 'endless' || !o || typeof o !== 'object') return {};
  const levels = {};
  for (const k of Object.keys(POWER)) levels[k] = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number((o.levels || {})[k]) || 0)));
  return { levels, mult: Math.max(1, Math.min(30, Math.floor(Number(o.mult) || 1))), ...(o.headstart === true ? { headstart: true } : {}) };
}

export async function isBanned(uid) { const b = await store().get('ac/bans', { type: 'json' }); return !!(b && b[uid]); }

// Welt für den nächsten Endlos-Lauf. Solange sie nicht gestartet wurde, gibt es immer dieselbe (kein Durchprobieren).
export async function nextSeed(uid) {
  let seed;
  await update(pKey(uid), cur => {
    const p = cur || {};
    if (p.next) { seed = p.next; return undefined; }
    seed = p.next = 'e' + Date.now().toString(36) + rid(4);
    return p;
  });
  return seed;
}

// Lauf-Start: legt das Ticket an. Antwort { ok, id } oder { error }.
export async function begin(uid, b) {
  const mode = b.mode, now = Date.now();
  if (!['endless', 'daily', 'tournament'].includes(mode)) return { error: 'mode', status: 400 };
  if (!validId(b.id)) return { error: 'id', status: 400 };
  const period = mode === 'daily' ? dayKey(new Date(now)) : mode === 'tournament' ? weekKey(new Date(now)) : 'all';
  let seed = null, err = null, begins = 0;
  await update(pKey(uid), cur => {
    const p = cur || {}, day = dayKey(new Date(now));
    err = null;
    if (p.day !== day) { p.day = day; p.begins = 0; }
    if (p.last && now - p.last < LIMITS.beginGapMs) { err = 'rate'; return undefined; }
    if (p.begins >= LIMITS.beginsPerDay) { err = 'rate'; return undefined; }
    if (mode === 'endless') {
      if (!p.next || p.next !== b.seed) { err = 'seed'; return undefined; }   // nur die vom Server vergebene Welt
      seed = p.next; p.next = null;
    } else {
      const c = p[mode] && p[mode].period === period ? p[mode] : { period, n: 0 };
      if (c.n >= LIMITS[mode]) { err = 'attempts'; return undefined; }
      c.n++; p[mode] = c; seed = seedFor(mode, period);
    }
    p.begins++; p.last = now; begins = p.begins;
    return p;
  });
  if (err) return { error: err, status: err === 'rate' ? 429 : 409 };
  if (begins === 150) await flag(uid, '', 'seeds', { mode });   // sehr viele Starts an einem Tag: evtl. Welten-Durchprobieren
  // Aufrüstungen/Kopfstart aus dem Tresor (Server-Spielstand); nur ohne Tresor (alte App) die bereinigten Werte vom Gerät
  const opts = (await ticketOpts(uid, mode, b.opts && b.opts.headstart === true)) || cleanOpts(mode, b.opts);
  await store().setJSON(tKey(uid, b.id), { mode, period, seed, opts, t0: now, cf: Array.isArray(b.flags) ? b.flags.filter(f => typeof f === 'string').slice(0, 4).map(f => f.slice(0, 12)) : [] });
  return { ok: true, id: b.id, seed, period, opts };
}

// Ticket einlösen (genau einmal). Gibt das Ticket zurück oder { error }.
export async function redeem(uid, id) {
  if (!validId(id)) return { error: 'ticket' };
  const st = store(), t = await st.get(tKey(uid, id), { type: 'json' });
  if (!t) return { error: 'ticket' };
  await st.delete(tKey(uid, id));
  if (Date.now() - t.t0 > LIMITS.ticketTtlMs) return { error: 'expired' };
  return t;
}

// Eingaben auf Menschenmöglichkeit prüfen. → { hard: Grund|null, flags: [...] }
export function analyze(inputs) {
  const flags = []; let hard = null, maxBurst = 0, j = 0;
  const ticks = [];
  for (const m of inputs) if (Array.isArray(m) && Number.isInteger(m[0])) ticks.push(m[0]);
  for (let i = 0; i < ticks.length; i++) { while (ticks[i] - ticks[j] >= TPS) j++; if (i - j + 1 > maxBurst) maxBurst = i - j + 1; }
  if (maxBurst >= LIMITS.burstHard) hard = 'burst';
  else if (maxBurst >= LIMITS.burstSoft) flags.push('burst' + maxBurst);
  return { hard, flags, maxBurst };
}

// Echtzeit gegen Spielzeit. → Grund oder null
export function timeCheck(t0, ticks, now = Date.now()) {
  const real = now - t0, game = ticks / TPS * 1000;
  if (real < game * LIMITS.fast - LIMITS.fastSlackMs) return 'fast';
  if (real > game * LIMITS.slow + LIMITS.slowSlackMs) return 'slow';
  return null;
}

// Vermerk für die Zentrale (letzte 300 Einträge)
export async function flag(uid, name, why, info = {}) {
  try {
    await update('ac/flags', cur => { const l = (cur && cur.list) || []; l.unshift({ u: uid, n: name, why, at: Date.now(), ...info }); if (l.length > 300) l.length = 300; return { list: l }; });
  } catch {}
}
// Replay der besten Läufe aufbewahren, damit sie sich jederzeit nachprüfen lassen
export async function keepReplay(mode, period, uid, rec) { try { await store().setJSON(`ac/r/${mode}/${period}/${uid}`, rec); } catch {} }

// Sperren / Entsperren / Eintrag entfernen (nur über /api/admin)
export async function setBan(uid, reason) {
  await update('ac/bans', cur => { const b = cur || {}; if (reason) b[uid] = { why: String(reason).slice(0, 80), at: Date.now() }; else delete b[uid]; return b; });
  if (reason) await unboard(uid);
}
// Aus den aktuellen Ranglisten (und der gerade beendeten Turnierwoche / dem gestrigen Tages-Run) entfernen → { board: Platz vorher }
export async function unboard(uid, only = null) {
  const prev = new Date(Date.now() - 7 * 86400000), yday = new Date(Date.now() - 86400000), out = {};
  for (const [m, per] of [['daily', dayKey()], ['daily', dayKey(yday)], ['tournament', weekKey()], ['tournament', weekKey(prev)], ['endless', 'all']]) {
    if (only && only !== m) continue;
    await update(`boards/${m}/${per}`, cur => { if (!cur) return undefined; const i = cur.entries.findIndex(e => e.u === uid); if (i < 0) return undefined; out[`${m}/${per}`] = i + 1; cur.entries.splice(i, 1); return cur; }).catch(() => {});
  }
  return out;
}
export { RULES };
