// POST /api/duel – Duelle: 90-Sekunden-Rennen für 4 Springer auf derselben Strecke.
// Ablauf: quick (sofort mitspielen) | create (Raum mit Code) | join | state | start | sync | finish | results | leave
//
// • Schnellsuche wartet höchstens 6 s auf echte Mitspieler. Freie Plätze füllt der Server mit „Geistern“
//   (Aufzeichnungen echter Läufe auf derselben Strecke) oder Bots auf – alle Geräte sehen dieselbe Aufstellung.
// • Jeder Spieler schickt nur seine Eingaben. Die Geräte rechnen die Läufe der anderen mit demselben
//   deterministischen Spielkern nach; Geister und Bots laufen auf jedem Gerät identisch mit.
// • Am Ende prüft der Server jeden Lauf per Replay.
import { simulate, VERSION, RULES, dayKey, duelRules, isStdDuel, HIT_RE, makeTrace, traceStep } from '../../www/core.js';
import { analyze, flag } from '../lib/anticheat.mjs';
import { runBot, skillFor, BOT_SPREAD } from '../../www/bot.js';
import { json, preflight, auth, update, store } from '../lib/db.mjs';

const SEATS = 4;
const QUICK_WAIT = 6000;           // Schnellsuche: so lange können weitere Menschen beitreten
const HOST_START = 4000;           // eigener Raum: Countdown nach „Start“
const LOCK = 1500;                 // so lange vor dem Start ist die Aufstellung fest
const RACE_MS = (RULES.duel.time / 60) * 1000;
// Regeln je Raum: Schnelles Rennen immer Standard; eigene Räume: Zeit, K.O., Kollision
const rulesOf = r => r.rules || duelRules({});
const ruleOpts = r => { const R = rulesOf(r); return { ko: R.ko, collide: R.collide, time: R.sec }; };
const raceMs = r => (rulesOf(r).time / 60) * 1000;
const cleanRules = o => { const R = duelRules(o && typeof o === 'object' ? { ko: o.ko === true, collide: o.collide === true, time: Number(o.time) } : {}); return R; };
const HIT_W = 90;                  // Kollision: so viele Ticks Spielraum (Anzeige-Puffer + Verbindung) bei der Nachprüfung
const HIT_REPLY = 600;             // so lange hat ein Getroffener Zeit, den Treffer bei sich einzutragen
const IDLE_OUT = 12000;            // ohne Lebenszeichen gilt man als ausgestiegen
const GRACE = 20000;               // nach Rennende so lange auf letzte Ergebnisse warten
const TRACKS = 8;                  // Strecken pro Tag – auf jeder sammeln sich Geister
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STYLE_RE = /^[a-z]{2,12}$/;
const CHARS = ['hops', 'kiki', 'robo', 'sprout', 'glimmer', 'pingo', 'flammi', 'ninja', 'zork', 'panda', 'uni'];
const LOOKS = [...CHARS, 'aurum', 'platina', 'kristallo'];   // Höhen-Figuren: tragbar, aber nie für Bots
const CHAR_NAMES = { hops: 'Hops', kiki: 'Kiki', robo: 'Robo', sprout: 'Sprossi', glimmer: 'Glimmer', pingo: 'Pingo', flammi: 'Flammi', ninja: 'Ninja', zork: 'Zork', panda: 'Panda', uni: 'Uni' };
const BOT_STYLE = [
  { jet: 'retro', trail: 'rainbow', shoe: 'red', hat: 'cap' }, { jet: 'bubble', trail: 'bubbles', shoe: 'cloud', hat: 'party' },
  { jet: 'cyber', trail: 'plasma', shoe: 'neon', hat: 'beanie' }, { jet: 'gold', trail: 'stars', shoe: 'gold', hat: 'tophat' }, { jet: 'classic', trail: 'fire', shoe: 'high', hat: 'wizard' },
];

const rnd = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const code5 = () => Array.from({ length: 5 }, () => LETTERS[rnd(LETTERS.length)]).join('');
const trackSeed = () => `duel-${dayKey()}-${rnd(TRACKS)}`;
const validCode = c => typeof c === 'string' && /^[A-Z2-9]{5}$/.test(c);
const look = b0 => { const b = { ...b0, style: b0.style && typeof b0.style === 'object' ? b0.style : {} }; return {
  ch: LOOKS.includes(b.char) ? b.char : 'hops',
  st: { jet: STYLE_RE.test(b.style?.jet) ? b.style.jet : 'classic', trail: STYLE_RE.test(b.style?.trail) ? b.style.trail : 'fire', shoe: STYLE_RE.test(b.style?.shoe) ? b.style.shoe : 'basic', hat: STYLE_RE.test(b.style?.hat) ? b.style.hat : 'none', land: STYLE_RE.test(b.style?.land) ? b.style.land : 'dust', face: STYLE_RE.test(b.style?.face) ? b.style.face : 'happy' },
}; };
export const roomKey = c => `duel/rooms/${c}`, runKey = (c, u) => `duel/runs/${c}/${u}`;
const ghostKey = s => `duel/ghosts/${s}`;

// Status aus der Zeit ableiten: lobby → run → done
function status(r, now) {
  if (!r.startAt) return r.players.length ? 'lobby' : 'done';
  if (now < r.startAt) return 'lobby';
  return now < r.startAt + raceMs(r) + GRACE ? 'run' : 'done';
}
function view(r, now) {
  return {
    code: r.code, seed: r.seed, host: r.host, pub: r.pub, status: status(r, now), startAt: r.startAt || 0, raceMs: raceMs(r), rules: ruleOpts(r),
    locked: !!r.fill, next: r.next || '', fill: r.fill ? r.fill.map(({ inputs, ...f }) => ({ ...f, inputs: inputs || undefined })) : null,
    players: r.players.map(p => ({ u: p.u, n: p.n, ch: p.ch, st: p.st })),
  };
}
function addPlayer(r, player, uid, lk, best, now) {
  if (r.players.some(p => p.u === uid)) return 'ok';
  if (r.fill || (r.startAt && now > r.startAt - LOCK)) return 'started';
  if (r.players.length >= SEATS) return 'full';
  r.players.push({ u: uid, n: player.name, ...lk, best: Math.max(0, Math.min(1e5, Number(best) || 0)), at: now });
  return 'ok';
}
async function newRoom(player, uid, lk, best, pub, now, rules = null) {
  for (let i = 0; i < 6; i++) {
    const code = code5();
    const room = { v: VERSION, code, seed: trackSeed(), host: uid, pub, created: now, rules: pub ? duelRules({}) : cleanRules(rules), startAt: pub ? now + QUICK_WAIT : 0, fill: null, wantFill: pub,
      players: [{ u: uid, n: player.name, ...lk, best: Math.max(0, Math.min(1e5, Number(best) || 0)), at: now }] };
    const res = await store().setJSON(roomKey(code), room, { onlyIfNew: true });
    if (res.modified !== false) return room;
  }
  throw new Error('busy');
}

// Freie Plätze auffüllen: zuerst Geister dieser Strecke (passend zum Niveau), dann Bots.
async function makeFill(r) {
  const free = r.wantFill ? SEATS - r.players.length : 0;
  if (free <= 0) return [];
  const avg = r.players.reduce((a, p) => a + (p.best || 0), 0) / r.players.length;
  // Geister nur bei Standard-Regeln (eine Aufzeichnung passt nicht zu K.O./anderer Zeit/Kollision)
  const pool = !isStdDuel(rulesOf(r)) ? [] : ((await store().get(ghostKey(r.seed), { type: 'json' }).catch(() => null))?.list || [])
    .filter(g => g.v === VERSION && !r.players.some(p => p.u === g.u));
  // Mischung aus ähnlich starken und zufälligen Läufen, damit es nicht immer dieselben sind
  pool.sort((a, b) => Math.abs(a.h - avg) - Math.abs(b.h - avg));
  const ghosts = [];
  while (ghosts.length < Math.min(free, 2) && pool.length) ghosts.push(pool.splice(rnd(Math.min(4, pool.length)), 1)[0]);
  const fill = ghosts.map(g => ({ kind: 'ghost', u: 'g:' + g.u, n: `👻 ${g.n}`, ch: g.ch, st: g.st, inputs: g.inputs, h: g.h }));
  // Bots: Stärke rund um das Duell-Niveau der Menschen, deterministisch (alle Geräte rechnen denselben Bot)
  const nb = free - fill.length, spread = BOT_SPREAD[nb] || [];
  const freeChars = CHARS.filter(c => !r.players.some(p => p.ch === c) && !fill.some(f => f.ch === c));
  for (let i = fill.length; i < free; i++) {
    const ch = freeChars.length ? freeChars.splice(rnd(freeChars.length), 1)[0] : CHARS[rnd(CHARS.length)], bseed = 1 + rnd(1e9);
    const skill = Math.round(skillFor(avg * (spread[i - fill.length] || 1) * (.95 + rnd(11) / 100)) * 100) / 100;
    const st = runBot(r.seed, skill, rulesOf(r).time + 10, bseed, ruleOpts(r));
    fill.push({ kind: 'bot', u: 'b:' + i, n: `🤖 ${CHAR_NAMES[ch]}-Bot`, ch, st: BOT_STYLE[rnd(BOT_STYLE.length)], skill, bseed, h: Math.floor(st.maxY / 10), t: st.tick, out: st.over && st.cause !== 'time' });
  }
  return fill;
}
// Aufstellung kurz vor dem Start festschreiben (einmalig, für alle gleich)
async function lockIfDue(r, now) {
  if (!r.startAt || r.fill || now < r.startAt - LOCK) return r;
  const fill = await makeFill(r);
  return update(roomKey(r.code), cur => { if (!cur || cur.fill) return undefined; cur.fill = fill; return cur; }).then(x => x || r);
}

export async function standings(r, now) {
  const runs = await Promise.all(r.players.map(p => store().get(runKey(r.code, p.u), { type: 'json' }).catch(() => null)));
  const R = rulesOf(r), over = r.startAt && now > r.startAt + raceMs(r) + GRACE;
  let list = r.players.map((p, i) => {
    const x = runs[i] || {};
    const idle = x.last ? now - x.last > IDLE_OUT : now > r.startAt + IDLE_OUT;
    const done = !!x.final || idle || over;
    return { u: p.u, n: p.n, ch: p.ch, st: p.st, kind: 'human', h: x.final ? x.vh : (x.h || 0), t: x.final ? x.tick : (x.tick || 0), out: x.final ? !!x.out : idle, verified: !!x.final, done, left: !x.final && idle };
  });
  for (const f of r.fill || []) list.push({ u: f.u, n: f.n, ch: f.ch, st: f.st, kind: f.kind, h: f.h, t: f.t || R.time, out: !!f.out, verified: true, done: true });
  const all = list.every(x => x.done);
  // Kollision: wenn alle fertig sind, einmal alle Treffer nachprüfen
  // (erst wenn alle Menschen ihren Lauf abgegeben haben oder die Zeit ganz um ist – sonst fehlt die Bahn des Ziels)
  if (R.collide && all && !r.verdict && (over || runs.every(x => x && x.final))) r = await verifyHits(r, runs);
  for (const x of list) if (r.verdict && r.verdict[x.u]) { x.h = 0; x.t = 0; x.out = true; x.dq = r.verdict[x.u]; }
  // K.O.: wer länger überlebt, steht vorne (Überlebende vor Ausgeschiedenen), dann die Höhe. Sonst nur die Höhe.
  if (R.ko) list.sort((a, b) => (a.out - b.out) || (b.t - a.t) || (b.h - a.h));
  else list.sort((a, b) => b.h - a.h);
  return { list, all, rules: ruleOpts(r) };
}
// Treffer nachprüfen: Wer einen Treffer meldet, muss das Ziel in der Nähe gehabt haben; wer getroffen wurde, muss ihn eingetragen haben.
async function verifyHits(r, runs) {
  const R = rulesOf(r), seats = [...r.players.map(p => ({ u: p.u, human: true })), ...(r.fill || []).map(f => ({ u: f.u, f }))], traces = [];
  seats.forEach((s, i) => {
    const tr = makeTrace();
    if (s.human) { const x = runs[i]; if (x && x.final) { simulate(r.seed, 'duel', x.inputs, ruleOpts(r), x.tick, traceStep(tr)); tr.end = x.tick; tr.inputs = x.inputs; } else tr.none = true; }
    else if (s.f.kind === 'bot') { runBot(r.seed, s.f.skill, R.time + 10, s.f.bseed, ruleOpts(r), traceStep(tr)); tr.end = tr.y.length; }
    else tr.none = true;
    traces.push(tr);
  });
  const verdict = {};
  const near = (A, t, T, type) => {
    for (let k = Math.max(0, t - HIT_W); k <= t + HIT_W; k++) {
      if (T.y[k] === undefined || T.d[k]) continue;
      if (Math.abs(A.x[t] - T.x[k]) > .75) continue;
      const dy = A.y[t] - T.y[k];
      if (type === 'S' ? dy > -20 && dy < 140 : Math.abs(dy) < 90) return true;
    }
    return false;
  };
  seats.forEach((s, i) => {
    const A = traces[i]; if (!s.human || A.none) return;
    for (const [t, c] of A.inputs) {
      if (typeof c !== 'string' || (c[0] !== 'S' && c[0] !== 'P')) continue;
      const n = Number(c[1]), T = traces[n];
      if (T && T.none) continue;   // Ziel hat keinen Lauf abgegeben (ausgestiegen) – nicht nachprüfbar
      if (n === i || !T || A.x[t] === undefined || !near(A, t, T, c[0])) { verdict[s.u] = 'hit'; return; }
      // menschliches Ziel: Treffer muss bei ihm angekommen sein (außer kurz vor seinem Ende)
      if (seats[n].human && t < T.end - HIT_REPLY) {
        const want = 'k' + i + (c[0] === 'S' ? 's' : c[2]);
        if (!T.inputs.some(([tt, cc]) => cc === want && tt >= t - HIT_W && tt <= t + HIT_REPLY)) verdict[seats[n].u] = verdict[seats[n].u] || 'ignored';
      }
    }
  });
  const nr = await update(roomKey(r.code), cur => { if (!cur || cur.verdict) return undefined; cur.verdict = verdict; return cur; }).catch(() => null);
  return nr || { ...r, verdict };
}

export default async req => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const raw = await req.text();
  if (raw.length > 300000) return json({ error: 'size' }, 413);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: 'json' }, 400); }
  const player = await auth(b.uid, b.secret);
  if (!player) return json({ error: 'auth' }, 401);
  const uid = b.uid, now = Date.now(), lk = look(b), code = String(b.code || '').toUpperCase();
  const getRoom = async () => (validCode(code) ? store().get(roomKey(code), { type: 'json' }) : null);

  switch (b.action) {
    // ---------- Schnellsuche: offenem Raum beitreten oder sofort einen öffnen (Start in 6 s) ----------
    case 'quick': {
      let joined = null;
      await update('duel/queue', async q => {
        joined = null;
        if (q && q.code && now - q.at < QUICK_WAIT - LOCK) {
          let res = '';
          const r = await update(roomKey(q.code), cur => {
            if (!cur) { res = 'gone'; return undefined; }
            res = addPlayer(cur, player, uid, lk, b.best, now);
            if (res !== 'ok') return undefined;
            if (cur.players.length >= SEATS) cur.startAt = Math.min(cur.startAt, now + 2500);
            return cur;
          });
          if (res === 'ok' && r) { joined = r; return r.players.length >= SEATS ? { code: '', at: 0 } : undefined; }
        }
        joined = await newRoom(player, uid, lk, b.best, true, now);
        return { code: joined.code, at: now };
      });
      return json({ ok: true, room: view(joined, now), now });
    }
    case 'create': {
      const room = await newRoom(player, uid, lk, b.best, false, now, b.rules);
      return json({ ok: true, room: view(room, now), now });
    }
    case 'join': {
      if (!validCode(code)) return json({ error: 'code' }, 400);
      let why = '';
      const r = await update(roomKey(code), cur => {
        if (!cur) { why = 'notfound'; return undefined; }
        const res = addPlayer(cur, player, uid, lk, b.best, now);
        if (res !== 'ok') { why = res; return undefined; }
        return cur;
      });
      if (why) return json({ error: why }, why === 'notfound' ? 404 : 409);
      return json({ ok: true, room: view(r, now), now });
    }
    case 'state': {
      let r = await getRoom();
      if (!r) return json({ error: 'notfound' }, 404);
      r = await lockIfDue(r, now);
      return json({ ok: true, room: view(r, now), now });
    }
    // Gastgeber startet; mit „fill“ werden freie Plätze mit Geistern/Bots belegt (auch allein möglich)
    case 'start': {
      if (!validCode(code)) return json({ error: 'code' }, 400);
      let why = '';
      const r = await update(roomKey(code), cur => {
        if (!cur) { why = 'notfound'; return undefined; }
        if (cur.host !== uid) { why = 'host'; return undefined; }
        if (cur.startAt) return undefined;
        cur.wantFill = !!b.fill;
        if (cur.players.length < 2 && !cur.wantFill) { why = 'alone'; return undefined; }
        cur.startAt = now + HOST_START; return cur;
      });
      if (why) return json({ error: why }, 409);
      return json({ ok: true, room: view(r, now), now });
    }
    // Gastgeber ändert die Regeln, solange das Rennen noch nicht gestartet ist
    case 'rules': {
      if (!validCode(code)) return json({ error: 'code' }, 400);
      let why = '';
      const r = await update(roomKey(code), cur => {
        if (!cur) { why = 'notfound'; return undefined; }
        if (cur.host !== uid || cur.pub) { why = 'host'; return undefined; }
        if (cur.startAt) { why = 'started'; return undefined; }
        cur.rules = cleanRules(b.rules); return cur;
      });
      if (why) return json({ error: why }, 409);
      return json({ ok: true, room: view(r, now), now });
    }
    case 'leave': {
      if (!validCode(code)) return json({ ok: true });
      await update(roomKey(code), cur => {
        if (!cur || cur.fill) return undefined;              // feste Aufstellung bleibt, wie sie ist
        cur.players = cur.players.filter(p => p.u !== uid);
        if (cur.host === uid && cur.players.length) cur.host = cur.players[0].u;
        if (!cur.players.length) cur.startAt = 0;
        return cur;
      }).catch(() => {});
      return json({ ok: true });
    }
    // ---------- Während des Rennens: eigene neue Eingaben schicken, die der anderen abholen ----------
    case 'sync': {
      // Raum und eigener Lauf parallel lesen, Schreiben und Lesen der anderen ebenfalls parallel → kurze Antwortzeit
      const [r, mine0] = await Promise.all([getRoom(), validCode(code) ? store().get(runKey(code, uid), { type: 'json' }).catch(() => null) : null]);
      if (!r || !r.players.some(p => p.u === uid)) return json({ error: 'notfound' }, 404);
      const mine = mine0 || { inputs: [], tick: 0, h: 0 };
      let write = null;
      if (!mine.final) {
        // Überlappung erlaubt: ging eine Antwort verloren, schickt der Client ab einem älteren Stand
        const from = Number(b.from);
        const add = Array.isArray(b.inputs) && Number.isInteger(from) && from >= 0 && from <= mine.inputs.length ? b.inputs.slice(mine.inputs.length - from) : [];
        let lastT = mine.inputs.length ? mine.inputs[mine.inputs.length - 1][0] : -1;
        const R = rulesOf(r), okCode = c => typeof c === 'string' && (/^[LRUD]$/.test(c) || (R.collide && HIT_RE.test(c)));
        for (const m of add.slice(0, 2000)) {
          if (!Array.isArray(m) || m.length !== 2 || !Number.isInteger(m[0]) || m[0] < lastT || m[0] > R.time || !okCode(m[1])) break;
          mine.inputs.push(m); lastT = m[0];
        }
        mine.tick = Math.max(mine.tick, Math.min(Number(b.tick) || 0, R.time));
        mine.h = Math.max(0, Math.min(1e5, Math.floor(Number(b.h) || 0)));
        mine.last = now;
        write = store().setJSON(runKey(code, uid), mine);
      }
      const have = b.have && typeof b.have === 'object' ? b.have : {};
      const others = await Promise.all(r.players.filter(p => p.u !== uid).map(async p => {
        const run = (await store().get(runKey(code, p.u), { type: 'json' }).catch(() => null)) || { inputs: [], tick: 0, h: 0 };
        const from = Math.max(0, Math.min(run.inputs.length, Number(have[p.u]) || 0));
        return { u: p.u, from, inputs: run.inputs.slice(from), total: run.inputs.length, tick: run.tick, h: run.final ? run.vh : run.h, done: !!run.final, idle: run.last ? now - run.last > IDLE_OUT : now > r.startAt + IDLE_OUT };
      }));
      await write;
      return json({ ok: true, others, mine: mine.inputs.length, now });
    }
    // ---------- Ende: vollständigen Lauf prüfen, Ergebnis eintragen, guten Lauf als Geist speichern ----------
    case 'finish': {
      const r = await getRoom();
      if (!r || !r.players.some(p => p.u === uid)) return json({ error: 'notfound' }, 404);
      // nur bis zum gemeldeten Ende rechnen: Wer aufgibt, bekommt die Höhe, die er wirklich erreicht hat
      const R = rulesOf(r), stop = Math.max(0, Math.min(R.time, Number.isInteger(b.tick) ? b.tick : R.time));
      const sim = simulate(r.seed, 'duel', Array.isArray(b.inputs) ? b.inputs : [], ruleOpts(r), stop);
      if (!sim.ok) return json({ error: 'replay:' + sim.err }, 422);
      { const an = analyze(Array.isArray(b.inputs) ? b.inputs : []); if (an.hard) { await flag(uid, '', an.hard, { mode: 'duel', h: sim.height, burst: an.maxBurst }); return json({ error: 'rejected', why: an.hard }, 422); } }
      const prev = (await store().get(runKey(code, uid), { type: 'json' })) || {};
      const S = sim.state, eco = { coins: S.coins, maxY: S.maxY, stats: S.stats, checkpoints: S.checkpoints, deaths: S.deaths, cause: S.cause, mode: 'duel' };
      await store().setJSON(runKey(code, uid), { ...prev, inputs: b.inputs, tick: sim.ticks, final: true, vh: sim.height, h: sim.height, out: R.ko && sim.over && sim.cause !== 'time', eco, last: now });
      if (isStdDuel(R) && sim.height >= 60 && sim.ticks >= R.time) {     // nur vollständige Standard-Rennen werden Geister
        const me = r.players.find(p => p.u === uid);
        await update(ghostKey(r.seed), cur => {
          const list = (cur && cur.list) || [];
          const i = list.findIndex(g => g.u === uid);
          if (i >= 0 && list[i].h >= sim.height) return undefined;
          if (i >= 0) list.splice(i, 1);
          list.push({ v: VERSION, u: uid, n: me.n, ch: me.ch, st: me.st, inputs: b.inputs, h: sim.height, at: now });
          list.sort((x, y) => y.at - x.at); if (list.length > 30) list.length = 30;
          return { list };
        }).catch(() => {});
      }
      return json({ ok: true, height: sim.height, ...(await standings(r, now)), now });
    }
    // ---------- Revanche: alle aus diesem Rennen landen im selben Folgeraum (die Gruppe bleibt zusammen) ----------
    case 'rematch': {
      const r = await getRoom();
      if (!r || !r.players.some(p => p.u === uid)) return json({ error: 'notfound' }, 404);
      const tryJoin = async c => {
        let res = '';
        const nr = await update(roomKey(c), cur => { if (!cur) { res = 'gone'; return undefined; } res = addPlayer(cur, player, uid, lk, b.best, now); return res === 'ok' ? cur : undefined; });
        return res === 'ok' ? nr : null;
      };
      if (r.next) { const nr = await tryJoin(r.next); if (nr) return json({ ok: true, room: view(nr, now), now }); }
      // noch kein Folgeraum (oder er läuft schon) → neuen öffnen und im alten Raum verlinken
      const fresh = await newRoom(player, uid, lk, b.best, false, now, ruleOpts(r));
      fresh.wantFill = !!r.wantFill;
      await store().setJSON(roomKey(fresh.code), fresh);
      let linked = fresh.code;
      await update(roomKey(code), cur => {
        if (!cur) return undefined;
        if (cur.next && cur.next !== r.next) { linked = cur.next; return undefined; }   // jemand war schneller
        cur.next = fresh.code; return cur;
      });
      if (linked !== fresh.code) { const nr = await tryJoin(linked); if (nr) return json({ ok: true, room: view(nr, now), now }); }
      return json({ ok: true, room: view(fresh, now), now });
    }
    case 'results': {
      const r = await getRoom();
      if (!r) return json({ error: 'notfound' }, 404);
      return json({ ok: true, ...(await standings(r, now)), now });
    }
  }
  return json({ error: 'action' }, 400);
};
export const config = { path: '/api/duel' };
