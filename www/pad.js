// SKY DUELL – Controller-Steuerung (Gamepad API)
// Läuft mit allen gängigen Controllern: Xbox (One/Series/360), PlayStation (DualShock 4, DualSense), Nintendo Switch Pro & Joy-Con,
// 8BitDo, Logitech, Stadia, Steam Controller, Backbone/Kishi u. a. Handy-Controller sowie generische USB-/Bluetooth-Pads.
//
// Einmal pro Bild poll() aufrufen – liefert Ereignisse nur bei der Kante (Drücken), nie Dauerfeuer:
//   { t: 'dir', d: 'L'|'R'|'U'|'D', rep }   Steuerkreuz oder linker Stick (rep = Wiederholung beim Halten, nur für Menüs)
//   { t: 'btn', b }                         south/east/west/north (Tasten nach Lage), lb, rb, lt, rt, select, start, l3, r3
// Pad.scroll = rechter Stick senkrecht (−1 … 1) zum Blättern in Menüs.
// Standard-Belegung (W3C): 0 unten, 1 rechts, 2 links, 3 oben, 4/5 Schulter, 6/7 Trigger, 8 Select, 9 Start, 10/11 Sticks, 12–15 Steuerkreuz, 16 Home.

const BTN = ['south', 'east', 'west', 'north', 'lb', 'rb', 'lt', 'rt', 'select', 'start', 'l3', 'r3'];
const ON = .55, OFF = .32;              // Stick: auslösen ab 55 %, loslassen unter 32 % (kein Flattern)
const REP_WAIT = 380, REP_EVERY = 130;  // Menü: Halten wiederholt nach 0,38 s alle 0,13 s

const LABELS = {
  xbox: { south: 'A', east: 'B', west: 'X', north: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', start: '☰', select: '⧉', name: 'Xbox' },
  ps: { south: '✕', east: '○', west: '□', north: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', start: 'Options', select: 'Share', name: 'PlayStation' },
  ns: { south: 'B', east: 'A', west: 'Y', north: 'X', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR', start: '+', select: '−', name: 'Nintendo' },
};
LABELS.generic = { ...LABELS.xbox, name: '' };

export function kindOf(id = '') {
  const s = String(id).toLowerCase();
  if (/045e|xbox|xinput|x-box|microsoft/.test(s)) return 'xbox';
  if (/057e|nintendo|pro controller|joy-?con|switch/.test(s)) return 'ns';
  if (/054c|playstation|dualsense|dualshock|ps[345]/.test(s) || /^wireless controller/.test(s)) return 'ps';   // DS4 meldet sich oft nur als „Wireless Controller“
  return 'generic';
}

// Klassischer Hut-Schalter (DirectInput, eine Achse): −1 = oben, dann im Uhrzeigersinn in Achtelschritten; > 1 = Ruhe
function hat(v) {
  if (!(v >= -1.05 && v <= 1.05)) return [0, 0];
  const i = Math.round((v + 1) / (2 / 7)) % 8;
  return [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]][i];
}
const down = b => !!b && (b.pressed || b.value > .5);

function read(gp) {
  const b = gp.buttons || [], a = gp.axes || [], std = gp.mapping === 'standard';
  const btn = {};
  for (let i = 0; i < BTN.length; i++) btn[BTN[i]] = down(b[i]);
  // Steuerkreuz: Standard = Tasten 12–15; sonst Achsen 6/7 (Linux/Firefox) oder Hut-Achse 9 (Windows/DirectInput)
  let dx = 0, dy = 0;
  if (std || b.length >= 16) { dx = (down(b[15]) ? 1 : 0) - (down(b[14]) ? 1 : 0); dy = (down(b[13]) ? 1 : 0) - (down(b[12]) ? 1 : 0); }
  if (!std && !dx && !dy) {
    if (a.length >= 10 && Math.abs(a[9]) <= 1.05 && a[9] !== 0) [dx, dy] = hat(a[9]);
    else if (a.length >= 8 && a.length < 10) { dx = Math.abs(a[6]) > .5 ? Math.sign(a[6]) : 0; dy = Math.abs(a[7]) > .5 ? Math.sign(a[7]) : 0; }
  }
  return { btn, dx, dy, sx: +a[0] || 0, sy: +a[1] || 0, ry: a.length >= 4 ? +a[3] || 0 : 0 };
}

const state = new Map();   // pro Controller: vorheriger Zustand
const live = new Set();   // angeschlossene Controller (Index)
let lastIdx = -1, lastUse = 0, everSeen = false, nextScan = 0, hooks = {};
function seenPad(gp) { const fresh = !live.has(gp.index); live.add(gp.index); everSeen = true; if (lastIdx < 0 || fresh) { lastIdx = gp.index; Pad.kind = kindOf(gp.id); } return fresh; }

export const Pad = {
  scroll: 0,
  kind: 'generic',
  init(h = {}) {
    hooks = h;
    if (!('getGamepads' in navigator)) return;
    addEventListener('gamepadconnected', e => { const gp = e.gamepad; if (gp && seenPad(gp)) hooks.connect && hooks.connect(Pad.kind, gp); });
    addEventListener('gamepaddisconnected', e => {
      const gp = e.gamepad; if (!gp || !live.delete(gp.index)) return;
      state.delete(gp.index);
      if (lastIdx === gp.index) lastIdx = live.size ? [...live][0] : -1;
      hooks.disconnect && hooks.disconnect(live.size);
    });
    try { for (const g of navigator.getGamepads()) if (g) seenPad(g); } catch {}
  },
  get connected() { return live.size > 0; },
  get seen() { return everSeen; },
  recent(ms = 20000) { return live.size > 0 && performance.now() - lastUse < ms; },
  label(b) { return (LABELS[Pad.kind] || LABELS.generic)[b] || b; },
  brand() { return (LABELS[Pad.kind] || LABELS.generic).name; },
  // Nintendo: rechts (A) bestätigt, unten (B) zurück – sonst umgekehrt
  isOk(b) { return b === (Pad.kind === 'ns' ? 'east' : 'south'); },
  isBack(b) { return b === (Pad.kind === 'ns' ? 'south' : 'east'); },

  poll(now = performance.now()) {
    const out = [];
    Pad.scroll = 0;
    if (!live.size) { if (now < nextScan) return out; nextScan = now + 1000; }   // ohne Controller nur einmal pro Sekunde nachsehen
    let list; try { list = navigator.getGamepads(); } catch { return out; }
    for (const gp of list) {
      if (!gp || gp.connected === false) continue;
      if (seenPad(gp)) hooks.connect && hooks.connect(Pad.kind, gp);   // Browser ohne „gamepadconnected“
      const r = read(gp);
      let s = state.get(gp.index);
      if (!s) {   // erster Blick (der Druck, der den Controller „weckt“, zählt mit)
        s = { btn: {}, dir: null, src: '', next: 0, stick: false };
        for (const k of BTN) s.btn[k] = false;
        state.set(gp.index, s);
      }
      let used = false;
      for (const k of BTN) {
        if (r.btn[k] && !s.btn[k]) { out.push({ t: 'btn', b: k, i: gp.index }); used = true; }
        s.btn[k] = r.btn[k];
      }
      // Richtung: Steuerkreuz hat Vorrang, sonst linker Stick (dominante Achse, mit Hysterese)
      let d = null;
      if (r.dx || r.dy) d = Math.abs(r.dx) >= Math.abs(r.dy) ? (r.dx < 0 ? 'L' : 'R') : (r.dy < 0 ? 'U' : 'D');
      else {
        const m = Math.hypot(r.sx, r.sy);
        if (m > (s.stick ? OFF : ON)) {
          s.stick = true;
          const keep = s.dir && s.src === 'stick';
          // eine laufende Richtung bleibt, bis der Stick deutlich in eine andere zeigt
          const horiz = Math.abs(r.sx) > Math.abs(r.sy) * (keep && (s.dir === 'U' || s.dir === 'D') ? 1.6 : keep ? .62 : 1);
          d = horiz ? (r.sx < 0 ? 'L' : 'R') : (r.sy < 0 ? 'U' : 'D');
        } else s.stick = false;
      }
      if (d !== s.dir) {
        s.dir = d; s.src = r.dx || r.dy ? 'dpad' : 'stick';
        if (d) { out.push({ t: 'dir', d, rep: false, i: gp.index }); s.next = now + REP_WAIT; used = true; }
      } else if (d && now >= s.next) { out.push({ t: 'dir', d, rep: true, i: gp.index }); s.next = now + REP_EVERY; }
      if (Math.abs(r.ry) > .25) { Pad.scroll = Math.sign(r.ry) * (Math.abs(r.ry) - .25) / .75; used = true; }
      if (used) { lastUse = now; if (lastIdx !== gp.index) { lastIdx = gp.index; Pad.kind = kindOf(gp.id); } }
    }
    return out;
  },

  // Vibration (Chrome/Edge/Safari: vibrationActuator, Firefox: hapticActuators)
  rumble(ms = 40, strong = .3, weak = .5) {
    if (!live.size || lastIdx < 0) return;
    let gp; try { gp = navigator.getGamepads()[lastIdx]; } catch { return; }
    if (!gp) return;
    const a = gp.vibrationActuator;
    try {
      if (a && a.playEffect) a.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong }).catch(() => {});
      else if (gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse) gp.hapticActuators[0].pulse(Math.max(strong, weak), ms);
    } catch {}
  },
};

// ---------- Menü-Bedienung: räumliche Navigation zwischen sichtbaren Bedienelementen ----------
const SEL = 'button:not([disabled]), a[href], select, input:not([type=hidden]), [tabindex="0"], [role=switch]';
export function focusables(root) {
  const out = [];
  for (const el of root.querySelectorAll(SEL)) {
    if (el.closest('[hidden]') || el.closest('[inert]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || +cs.opacity === 0) continue;
    out.push(el);
  }
  return out;
}
// Standard-Auswahl: [data-pad-default] → erster Haupt-Knopf ohne Werbung → erster Knopf ohne Werbung → erstes Element
export function pickDefault(root) {
  const f = focusables(root);
  return f.find(e => e.matches('[data-pad-default]')) || f.find(e => e.matches('.btn.go:not(.ad)')) || f.find(e => e.matches('.btn:not(.ad), .mode')) || f[0] || null;
}
export function focusEl(el) {
  if (!el) return false;
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {}
  return document.activeElement === el;
}
// Nächstes Element in Richtung d: bevorzugt geradeaus, seitlicher Versatz zählt doppelt
export function move(root, from, d) {
  const f = focusables(root).filter(e => e !== from && !e.contains(from) && !from.contains(e));
  const a = from.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestS = Infinity;
  for (const el of f) {
    const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
    let main, side, overlap;
    if (d === 'L' || d === 'R') {
      main = d === 'L' ? a.left - b.right : b.left - a.right;
      if ((d === 'L' ? bx >= ax - 1 : bx <= ax + 1)) continue;
      overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      side = overlap > 0 ? 0 : Math.abs(by - ay);
      if (overlap <= 0 && side > Math.max(0, main) * 1.2 + 24) continue;   // nicht „rechts“, wenn es eigentlich darüber/darunter liegt
    } else {
      main = d === 'U' ? a.top - b.bottom : b.top - a.bottom;
      if ((d === 'U' ? by >= ay - 1 : by <= ay + 1)) continue;
      overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      side = overlap > 0 ? Math.abs(bx - ax) * .25 : Math.abs(bx - ax);
    }
    const s = Math.max(0, main) + side * 2;
    if (s < bestS) { bestS = s; best = el; }
  }
  return best;
}
