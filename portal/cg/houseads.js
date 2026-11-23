// Eigenwerbung (nur Web, solange kein Werbe-Partner wie AdSense eingerichtet ist)
// 9 verschiedene, interaktive Spots: FAX Messenger (4), ITpaul (4, nur DE/EN) und Sky Duell selbst (Freunde einladen).
// Regeln: klar als Anzeige gekennzeichnet · gleiche Stellen und Obergrenzen wie echte Werbung · nur der Knopf in der
// Anzeige öffnet eine Seite (nie versehentlich) · kein Werbeumsatz wird gezählt · Rotation ohne Wiederholung.
const UTM = (url, id, placement) => `${url}?utm_source=skyrush&utm_medium=house_ad&utm_campaign=${encodeURIComponent(placement || 'pause')}&utm_content=${id}`;
const ORBS = '<i class="o1"></i><i class="o2"></i><i class="o3"></i>';
const FAXHEAD = '<div class="hx-top"><b class="fx">F<em>A</em>X</b><span class="hx-tag">Messenger</span></div>';
const IPHEAD = (mod, name) => `<span class="hx-mono"><i></i>${mod} — ${name}</span><b class="ip">IT<em>paul</em></b>`;
const GLYPH = '█▓▒░▚▞◆◇●○■□▲△◼◻⬢⬡0123456789';
const scramble = n => Array.from({ length: n }, () => GLYPH[Math.random() * GLYPH.length | 0]).join('');

export const SPOTS = [
  // ---------- FAX: Verschlüsselung live ----------
  { id: 'fax-crypt', url: 'https://faxmessenger.com/', html: () => `<div class="hx hx-fax">${ORBS}${FAXHEAD}
      <strong class="hx-h">Nur ihr zwei könnt das lesen.</strong>
      <div class="fc">
        <div class="fc-row me"><span class="fc-who">Du</span><span class="fc-bub" data-me>…</span></div>
        <div class="fc-row mid"><span class="fc-who">Unterwegs sieht jeder nur:</span><code class="fc-cip" data-cip>· · ·</code></div>
        <div class="fc-row them"><span class="fc-who">Dein Freund</span><span class="fc-bub" data-them>…</span></div>
      </div>
      <span class="hx-hint">Tippe eine Nachricht an:</span>
      <div class="hx-chips" data-chips><button>Treffen um 8? 🍕</button><button>Hab dich lieb ❤️</button><button>Neue PIN: 4711</button></div>
      <a class="hx-cta">Kostenlos öffnen · faxmessenger.com</a></div>`,
    mount(el, x) {
      const me = el.querySelector('[data-me]'), cip = el.querySelector('[data-cip]'), them = el.querySelector('[data-them]');
      const send = txt => {
        me.textContent = txt; them.textContent = '…'; them.classList.remove('pop'); me.classList.remove('pop'); void me.offsetWidth; me.classList.add('pop');
        let k = 0; x.clear(); x.every(70, () => { cip.textContent = scramble(Math.max(10, txt.length + 6)); if (++k > 14) { x.clear(); them.textContent = txt; them.classList.add('pop'); } });
      };
      el.querySelectorAll('[data-chips] button').forEach(b => b.onclick = () => { x.interact(); send(b.textContent); });
      x.later(700, () => send(el.querySelector('[data-chips] button').textContent));
    } },
  // ---------- FAX: Was weiß dein Messenger? ----------
  { id: 'fax-know', url: 'https://faxmessenger.com/', html: () => `<div class="hx hx-fax">${ORBS}${FAXHEAD}
      <strong class="hx-h">Was weiß dein Messenger über dich?</strong>
      <div class="fk">
        <button class="fk-c"><span class="f"><i>📱</i>Telefonnummer</span><span class="b">FAX: nicht nötig</span></button>
        <button class="fk-c"><span class="f"><i>📧</i>E-Mail &amp; Konto</span><span class="b">FAX: kein Konto</span></button>
        <button class="fk-c"><span class="f"><i>📒</i>Adressbuch</span><span class="b">FAX: kein Zugriff</span></button>
        <button class="fk-c"><span class="f"><i>🛰️</i>Tracking</span><span class="b">FAX: kein Tracking</span></button>
      </div>
      <span class="hx-hint" data-hint>Tippe die Karten an</span>
      <div class="fk-res" data-res hidden>FAX weiß über dich: <b>nichts.</b></div>
      <a class="hx-cta">Kostenlos öffnen · faxmessenger.com</a></div>`,
    mount(el, x) {
      const cards = [...el.querySelectorAll('.fk-c')], res = el.querySelector('[data-res]'), hint = el.querySelector('[data-hint]');
      const check = () => { if (cards.every(c => c.classList.contains('on'))) { res.hidden = false; hint.hidden = true; } };
      cards.forEach(c => c.onclick = () => { x.interact(); c.classList.add('on'); check(); });
      x.later(900, () => { cards[0].classList.add('on'); });
    } },
  // ---------- FAX: Quanten-Schloss ----------
  { id: 'fax-quantum', url: 'https://faxmessenger.com/', html: () => `<div class="hx hx-fax">${ORBS}${FAXHEAD}
      <strong class="hx-h">Sicher – auch gegen die Quantencomputer von morgen.</strong>
      <div class="fq">
        <div class="fq-l old" data-old><i data-oi>🔒</i><b>Nur klassisch verschlüsselt</b></div>
        <div class="fq-l pq" data-pq><i>🔒</i><b>FAX · Post-Quanten</b></div>
      </div>
      <input class="fq-r" type="range" min="0" max="100" value="8" aria-label="Rechenleistung" data-r>
      <div class="fq-sc"><span>Rechenleistung heute</span><span>Quantencomputer der Zukunft</span></div>
      <span class="hx-small">Schieb den Regler. FAX nutzt Post-Quanten-Verschlüsselung nach NIST-Standard.</span>
      <a class="hx-cta">Kostenlos öffnen · faxmessenger.com</a></div>`,
    mount(el, x) {
      const r = el.querySelector('[data-r]'), old = el.querySelector('[data-old]'), oi = el.querySelector('[data-oi]'), pq = el.querySelector('[data-pq]');
      const upd = () => { const v = +r.value, broke = v > 68; old.classList.toggle('broke', broke); oi.textContent = broke ? '🔓' : '🔒'; pq.classList.toggle('hold', v > 68); old.style.setProperty('--sh', v > 40 && !broke ? (v - 40) / 28 : 0); };
      r.oninput = () => { x.interact(); x.clear(); upd(); };
      let v = 8; x.later(600, () => x.every(30, () => { v += 1.6; r.value = v; upd(); if (v >= 92) x.clear(); }));
      upd();
    } },
  // ---------- FAX: Jedes Gerät ----------
  { id: 'fax-devices', url: 'https://faxmessenger.com/', html: () => `<div class="hx hx-fax">${ORBS}${FAXHEAD}
      <strong class="hx-h">Ein Messenger. Jedes Gerät.</strong>
      <div class="fd-tabs"><button data-d="0" class="on">🌐 Browser</button><button data-d="1">🪟 Windows</button><button data-d="2">📱 Handy</button></div>
      <div class="fd" data-scr data-d="0"><div class="fd-bar"><i></i><i></i><i></i><span data-t>faxmessenger.app</span></div>
        <div class="fd-body"><span class="fd-m a">Bist du schon da?</span><span class="fd-m b">Bin gleich da! 🚲</span><span class="fd-m a">🔐 Ende-zu-Ende verschlüsselt</span></div></div>
      <span class="hx-small" data-txt>Einfach öffnen – nichts installieren.</span>
      <a class="hx-cta">Kostenlos öffnen · faxmessenger.com</a></div>`,
    mount(el, x) {
      const tabs = [...el.querySelectorAll('.fd-tabs button')], scr = el.querySelector('[data-scr]'), t = el.querySelector('[data-t]'), txt = el.querySelector('[data-txt]');
      const T = [['faxmessenger.app', 'Einfach öffnen – nichts installieren.'], ['FAX – Microsoft Store', 'Als App im Microsoft Store.'], ['FAX', 'Auf den Startbildschirm legen – wie eine App.']];
      const set = i => { tabs.forEach((b, k) => b.classList.toggle('on', k === i)); scr.dataset.d = i; t.textContent = T[i][0]; txt.textContent = T[i][1]; };
      tabs.forEach((b, i) => b.onclick = () => { x.interact(); x.clear(); set(i); });
      let i = 0; x.every(1700, () => set(i = (i + 1) % 3));
    } },
  // ---------- ITpaul: PC-Konfigurator ----------
  { id: 'itp-pc', url: 'https://itpaul.com/', langs: ['de', 'en'], html: () => `<div class="hx hx-itp">${IPHEAD('MODUL 02', 'PC-BUILDS')}
      <strong class="hx-h">Dein PC. Gebaut für das, was du machst.</strong>
      <div class="ip-opts" data-o><button class="on">🎮 Gaming</button><button>🤖 KI lokal</button><button>🎬 Video</button><button>💼 Büro</button></div>
      <ul class="ip-spec" data-s></ul>
      <a class="hx-cta">PC-Build anfragen · itpaul.com</a></div>`,
    mount(el, x) {
      const S = [['Starke Grafikkarte für hohe FPS', 'Schneller Prozessor und Arbeitsspeicher', 'Leise Kühlung, sauberes Kabelmanagement'],
        ['Viel Grafikspeicher (VRAM) für große Modelle', 'Viel Arbeitsspeicher', 'Schnelle NVMe-SSDs für Modelle und Daten'],
        ['Viele Kerne zum Rendern', 'Grafikkarte mit Video-Encoder', 'Große, schnelle SSDs'],
        ['Leise und sparsam', 'In Sekunden startklar', 'Sicher eingerichtet, mit Backup']];
      const bs = [...el.querySelectorAll('[data-o] button')], ul = el.querySelector('[data-s]');
      const set = i => { bs.forEach((b, k) => b.classList.toggle('on', k === i)); ul.innerHTML = S[i].map(s => `<li>${s}</li>`).join(''); ul.classList.remove('pop'); void ul.offsetWidth; ul.classList.add('pop'); };
      bs.forEach((b, i) => b.onclick = () => { x.interact(); x.clear(); set(i); });
      set(0); let i = 0; x.every(1800, () => set(i = (i + 1) % 4));
    } },
  // ---------- ITpaul: Routine-Rechner (KI-Agenten) ----------
  { id: 'itp-agent', url: 'https://itpaul.com/', langs: ['de', 'en'], html: () => `<div class="hx hx-itp">${IPHEAD('MODUL 03', 'KI-AGENTEN')}
      <strong class="hx-h">Wie viel Zeit frisst Routine?</strong>
      <span class="hx-small">Mails sortieren, Rechnungen erfassen, Daten abtippen, Termine planen …</span>
      <div class="ia"><input type="range" min="1" max="20" value="5" data-r aria-label="Stunden pro Woche"><b data-h>5 h pro Woche</b></div>
      <div class="ia-out"><span><b data-m>22</b><small>Stunden im Monat</small></span><span><b data-y>33</b><small>Arbeitstage im Jahr</small></span></div>
      <span class="hx-small">Genau solche Aufgaben können KI-Agenten übernehmen.</span>
      <a class="hx-cta">KI-Agent besprechen · itpaul.com</a></div>`,
    mount(el, x) {
      const r = el.querySelector('[data-r]'), h = el.querySelector('[data-h]'), m = el.querySelector('[data-m]'), y = el.querySelector('[data-y]');
      const upd = () => { const v = +r.value; h.textContent = `${v} h pro Woche`; m.textContent = Math.round(v * 4.33); y.textContent = Math.round(v * 52 / 8); };
      r.oninput = () => { x.interact(); x.clear(); upd(); };
      let v = 2; x.later(500, () => x.every(90, () => { r.value = ++v; upd(); if (v >= 8) x.clear(); }));
      upd();
    } },
  // ---------- ITpaul: Sicherheits-Check ----------
  { id: 'itp-check', url: 'https://itpaul.com/', langs: ['de', 'en'], html: () => `<div class="hx hx-itp">${IPHEAD('MODUL 04', 'SICHERHEIT')}
      <strong class="hx-h">30-Sekunden-Sicherheits-Check</strong>
      <div class="ic" data-q>
        <div><span>Laufen deine Backups automatisch?</span><button>Ja</button><button>Nein</button></div>
        <div><span>Überall Zwei-Faktor-Anmeldung?</span><button>Ja</button><button>Nein</button></div>
        <div><span>Router und Software aktuell?</span><button>Ja</button><button>Nein</button></div>
      </div>
      <div class="ic-res" data-res>Beantworte die drei Fragen.</div>
      <a class="hx-cta">Check anfragen · itpaul.com</a></div>`,
    mount(el, x) {
      const rows = [...el.querySelectorAll('[data-q] > div')], res = el.querySelector('[data-res]');
      const upd = () => {
        const a = rows.map(r => r.dataset.a), yes = a.filter(v => v === 'y').length;
        if (a.some(v => !v)) return;
        res.className = 'ic-res ' + (yes === 3 ? 'ok' : 'warn');
        res.textContent = yes === 3 ? '3 von 3 – stark! Ein Profi-Blick lohnt sich trotzdem.' : `${yes} von 3 – da geht noch was. ITpaul sichert das für dich ab.`;
      };
      rows.forEach(r => r.querySelectorAll('button').forEach((b, k) => b.onclick = () => { x.interact(); r.dataset.a = k ? 'n' : 'y'; r.querySelectorAll('button').forEach((o, j) => o.classList.toggle('on', j === k)); upd(); }));
    } },
  // ---------- ITpaul: Leistungen ----------
  { id: 'itp-services', url: 'https://itpaul.com/', langs: ['de', 'en'], html: () => `<div class="hx hx-itp">${IPHEAD('MODUL 01', 'LEISTUNGEN')}
      <strong class="hx-h">Plane Systeme. Mit Präzision.</strong>
      <div class="hx-grid" data-g>
        <button data-i="0"><b>IT-Beratung &amp; Netzwerke</b></button><button data-i="1"><b>PC-Builds nach Maß</b></button>
        <button data-i="2"><b>KI-Agenten &amp; Automatisierung</b></button><button data-i="3"><b>Datenschutz &amp; Verschlüsselung</b></button>
      </div>
      <span class="hx-small ip-det" data-d>Tippe ein Modul an.</span>
      <span class="hx-mono">RÖSRATH · ANTWORT MEIST IN 24 H</span>
      <a class="hx-cta">Projekt starten · itpaul.com</a></div>`,
    mount(el, x) {
      const D = ['Planung, Einrichtung und Wartung – vom WLAN bis zum Server.', 'Komponenten passend zu Budget und Einsatz, sauber gebaut und getestet.', 'Agenten, die wiederkehrende Aufgaben zuverlässig erledigen.', 'Verschlüsselung, Backups und Zugriffe richtig aufsetzen.'];
      const bs = [...el.querySelectorAll('[data-g] button')], d = el.querySelector('[data-d]');
      const set = i => { bs.forEach((b, k) => b.classList.toggle('on', k === i)); d.textContent = D[i]; };
      bs.forEach((b, i) => b.onclick = () => { x.interact(); x.clear(); set(i); });
      let i = -1; x.every(1600, () => set(i = (i + 1) % 4));
    } },
  // ---------- Sky Duell: Freund herausfordern ----------
  { id: 'sky-invite', url: null, html: () => `<div class="hx hx-sky">
      <span class="hx-mono">⚔️ DUELL</span>
      <strong class="hx-h">Zu zweit macht’s doppelt Spaß.</strong>
      <div class="sk-race"><span class="sk-a" style="--c:#FFC83D"></span><span class="sk-b" style="--c:#3BE8A4"></span><i></i><i></i><i></i><i></i></div>
      <span class="hx-small">Schick einem Freund den Link – im Duell springt ihr live gegeneinander.</span>
      <button class="hx-cta" data-share>🔗 Freund einladen</button></div>`,
    mount(el, x) {
      el.querySelector('[data-share]').onclick = async () => {
        x.interact(); x.cta();
        const url = x.site + '/', text = x.tr('Spring mit mir in den Himmel: Sky Duell – kostenlos im Browser und als App.');
        try { if (navigator.share) await navigator.share({ title: 'Sky Duell', text, url }); else { await navigator.clipboard.writeText(text + ' ' + url); el.querySelector('[data-share]').textContent = x.tr('Link kopiert!'); } } catch {}
      };
    } },
];

// Rotation: jede Anzeige einmal, dann neu mischen (pro Sprache), keine direkte Wiederholung
export function pickSpot(st, lang) {
  const ok = SPOTS.filter(s => !s.langs || s.langs.includes(lang)).map(s => s.id);
  let bag = (st.hxBag || []).filter(id => ok.includes(id));
  if (!bag.length) { bag = ok.slice().sort(() => Math.random() - .5); if (bag[0] === st.hxLast && bag.length > 1) bag.push(bag.shift()); }
  const id = bag.shift(); st.hxBag = bag; st.hxLast = id;
  return SPOTS.find(s => s.id === id);
}

let cssDone = false;
function css() {
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style'); s.id = 'hx-css'; s.textContent = CSS; document.head.appendChild(s);
}

// Läuft gerade eine Eigenwerbung? closeHouseAd() schließt sie sofort ohne Belohnung (z. B. wenn ein Duell startet)
let current = null;
export const houseAdOpen = () => !!current;
export function closeHouseAd() { if (current) current(false); }
// Zeigt eine Anzeige; löst true auf, wenn der Spieler sie schließt (nach Ablauf der Sekunden)
export function showHouseAd({ seconds, reward, placement, st, save, site = location.origin, tr = s => s }) {
  css();
  return new Promise(res => {
    const lang = String(document.documentElement.lang || 'de').slice(0, 2);
    const spot = pickSpot(st, lang);
    const stats = (st.hxStats ||= {}), my = (stats[spot.id] ||= { v: 0, i: 0, c: 0 }); my.v++; save();
    const el = document.createElement('div');
    el.className = 'hx-wrap';
    el.innerHTML = `<div class="hx-box"><div class="hx-label">Anzeige · vom Macher von Sky Duell</div>${spot.html()}<button class="btn hx-go" disabled></button></div>`;
    const cta = el.querySelector('a.hx-cta');
    if (cta && spot.url) { cta.href = UTM(spot.url, spot.id, placement); cta.target = '_blank'; cta.rel = 'noopener'; cta.addEventListener('click', () => { my.c++; save(); }); }
    document.body.appendChild(el);
    const timers = new Set(), card = el.querySelector('.hx');
    let touched = false;
    const x = {
      site, tr,
      later: (ms, f) => { const t = setTimeout(f, ms); timers.add(t); },
      every: (ms, f) => { const t = setInterval(f, ms); timers.add(t); },
      clear: () => { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers.clear(); },
      interact: () => { if (!touched) { touched = true; my.i++; save(); } },
      cta: () => { my.c++; save(); },
    };
    try { spot.mount(card, x); } catch {}
    // Vollbild: Kennzeichnung oben und Knopf unten liegen direkt auf der Anzeige
    if (card) { card.prepend(el.querySelector('.hx-label')); card.append(el.querySelector('.hx-go')); }
    const btn = el.querySelector('.hx-go');
    let s = seconds;
    const tick = () => { btn.textContent = reward ? (s > 0 ? `Belohnung in ${s} s` : 'Belohnung holen') : (s > 0 ? `Weiter in ${s} s` : 'Weiter'); btn.disabled = s > 0; btn.classList.toggle('go', s <= 0); s--; };
    tick(); const iv = setInterval(() => { tick(); if (s < 0) clearInterval(iv); }, 1000);
    const close = ok => { if (current !== close) return; current = null; clearInterval(iv); x.clear(); el.classList.add('out'); setTimeout(() => el.remove(), 220); res(ok); };
    current = close;
    btn.onclick = () => close(true);
  });
}

const CSS = `
.hx-wrap{position:fixed;inset:0;z-index:60;background:#0c0720;animation:hxIn .2s ease-out both}
.hx-wrap.out{opacity:0;transition:opacity .2s}
@keyframes hxIn{from{opacity:0}to{opacity:1}}
/* Vollbild wie eine echte Anzeige: die Anzeige füllt den ganzen Bildschirm, Inhalt mittig, Knopf unten */
.hx-box{position:absolute;inset:0;display:flex}
.hx{flex:1;position:relative;overflow-x:hidden;overflow-y:auto;isolation:isolate;border:0;border-radius:0;box-shadow:none;display:flex;flex-direction:column;justify-content:center;gap:14px;text-align:left;
  padding:calc(env(safe-area-inset-top,0px) + 54px) 22px calc(env(safe-area-inset-bottom,0px) + 96px)}
.hx>:not(i):not(.hx-label):not(.hx-go){width:100%;max-width:480px;margin-inline:auto}
.hx-label{position:absolute;top:calc(env(safe-area-inset-top,0px) + 14px);left:50%;transform:translateX(-50%);white-space:nowrap;font:500 10.5px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.5);padding:6px 12px;border-radius:99px;z-index:2}
.hx-go{position:absolute;left:22px;right:22px;bottom:calc(env(safe-area-inset-bottom,0px) + 22px);max-width:480px;margin-inline:auto;z-index:2}
.hx button{font:inherit;cursor:pointer}
.hx-h{font-size:clamp(24px,6.5vw,34px);line-height:1.12;letter-spacing:-.02em;display:block}
.hx-hint{font:500 10.5px var(--mono);letter-spacing:.1em;text-transform:uppercase;opacity:.65}
.hx-small{font-size:15px;line-height:1.45;opacity:.88}
.hx-cta{display:block;width:100%;text-align:center;text-decoration:none;font-weight:700;font-size:15px;border-radius:14px;padding:12px 10px;margin-top:4px;border:0}
.hx-chips{display:flex;flex-wrap:wrap;gap:6px}
.hx-chips button{border-radius:99px;padding:7px 11px;font-size:13px}
.pop{animation:hxPop .35s cubic-bezier(.2,1.6,.4,1) both}
@keyframes hxPop{from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}}
/* FAX */
.hx-fax{background:#07070D;color:#F2F0FF}
.hx-fax i[class^=o]{position:absolute;border-radius:50%;filter:blur(30px);z-index:-1;opacity:.7;animation:hxOrb 9s ease-in-out infinite alternate}
.hx-fax .o1{width:190px;height:190px;left:-60px;top:-70px;background:#7B4DFF}
.hx-fax .o2{width:170px;height:170px;right:-60px;top:60px;background:#18C8C0;animation-delay:-3s}
.hx-fax .o3{width:170px;height:170px;left:70px;bottom:-100px;background:#FF4FA0;opacity:.4;animation-delay:-6s}
@keyframes hxOrb{to{transform:translate(30px,20px) scale(1.15)}}
.hx-top{display:flex;align-items:baseline;gap:10px}
.hx-fax .fx{font-size:40px;line-height:1;letter-spacing:.18em;font-weight:700}
.hx-fax .fx em{font-style:normal;background:linear-gradient(90deg,#9F84FF,#3BE0D4);-webkit-background-clip:text;background-clip:text;color:transparent}
.hx-tag{font:500 11px var(--mono);letter-spacing:.2em;text-transform:uppercase;opacity:.7}
.hx-fax .hx-cta{background:#F2F0FF;color:#07070D}
.hx-fax .hx-chips button,.hx-fax .fd-tabs button{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:#F2F0FF}
.hx-fax .hx-chips button:active{background:rgba(255,255,255,.2)}
.fc{display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:10px}
.fc-row{display:flex;flex-direction:column;gap:3px}
.fc-row.me{align-items:flex-end}.fc-row.them{align-items:flex-start}.fc-row.mid{align-items:center}
.fc-who{font:500 9.5px var(--mono);letter-spacing:.1em;text-transform:uppercase;opacity:.55}
.fc-bub{max-width:82%;padding:7px 12px;border-radius:16px;font-size:14px;line-height:1.3}
.me .fc-bub{background:linear-gradient(135deg,#7B4DFF,#5A3BD8);border-bottom-right-radius:5px}
.them .fc-bub{background:#22222E;border-bottom-left-radius:5px}
.fc-cip{font:500 13px var(--mono);letter-spacing:.06em;color:#3BE0D4;background:rgba(59,224,212,.08);border:1px dashed rgba(59,224,212,.4);border-radius:10px;padding:5px 10px;max-width:100%;overflow:hidden;white-space:nowrap}
.fk{display:grid;grid-template-columns:1fr 1fr;gap:8px;perspective:600px}
.fk-c{position:relative;height:66px;border:0;background:none;padding:0;transform-style:preserve-3d;transition:transform .45s cubic-bezier(.2,1.2,.4,1)}
.fk-c.on{transform:rotateY(180deg)}
.fk-c span{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:14px;backface-visibility:hidden;-webkit-backface-visibility:hidden;font-size:13px;font-weight:700;color:#F2F0FF;padding:4px}
.fk-c .f{background:rgba(255,80,110,.16);border:1px solid rgba(255,80,110,.45)}
.fk-c .f i{font-style:normal;font-size:20px}
.fk-c .b{background:rgba(59,224,212,.16);border:1px solid rgba(59,224,212,.5);transform:rotateY(180deg);color:#9FF5EC}
.fk-res{font-size:17px;text-align:center;animation:hxPop .4s both}.fk-res b{color:#3BE0D4}
.fq{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fq-l{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 6px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);text-align:center;font-size:12.5px;transition:background .3s,border-color .3s}
.fq-l i{font-style:normal;font-size:30px;display:block}
.fq-l.old{animation:hxShake .12s linear infinite;animation-play-state:paused;transform:translateX(calc(var(--sh,0) * 2px))}
.fq-l.old.broke{background:rgba(255,60,90,.22);border-color:#FF4F6E}
.fq-l.pq.hold{background:rgba(59,224,212,.18);border-color:#3BE0D4;box-shadow:0 0 22px rgba(59,224,212,.35)}
@keyframes hxShake{50%{transform:translateX(-2px)}}
.fq-r{width:100%;accent-color:#3BE0D4}
.fq-sc{display:flex;justify-content:space-between;font:500 9.5px var(--mono);letter-spacing:.06em;opacity:.6;text-transform:uppercase;margin-top:-6px}
.fd-tabs{display:flex;gap:6px}.fd-tabs button{flex:1;border-radius:12px;padding:7px 4px;font-size:12.5px}
.fd-tabs button.on{background:#F2F0FF;color:#07070D;border-color:#F2F0FF}
.fd{border:1px solid rgba(255,255,255,.2);border-radius:14px;overflow:hidden;background:#101018;transition:border-radius .3s,width .3s;margin:0 auto;width:100%}
.fd[data-d="2"]{width:58%;border-radius:22px}
.fd-bar{display:flex;align-items:center;gap:5px;padding:7px 10px;background:rgba(255,255,255,.07);font:500 10px var(--mono);opacity:.9}
.fd-bar i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.3)}
.fd[data-d="1"] .fd-bar{flex-direction:row-reverse;justify-content:space-between}.fd[data-d="2"] .fd-bar i{display:none}
.fd[data-d="2"] .fd-bar{justify-content:center}
.fd-body{display:flex;flex-direction:column;gap:5px;padding:10px}
.fd-m{max-width:85%;font-size:12px;padding:5px 9px;border-radius:12px}
.fd-m.a{align-self:flex-start;background:#22222E}.fd-m.b{align-self:flex-end;background:#5A3BD8}
/* ITpaul */
.hx-itp{background:#ECE7DE;color:#16140F}
.hx-itp .hx-mono{font:500 10.5px var(--mono);letter-spacing:.14em;display:flex;align-items:center;gap:8px;opacity:.75}
.hx-itp .hx-mono i{width:8px;height:8px;border-radius:50%;background:#2FB36B;box-shadow:0 0 0 3px rgba(47,179,107,.2);animation:hxBlink 2s infinite}
@keyframes hxBlink{50%{opacity:.35}}
.hx-itp .ip{font-size:36px;line-height:1;letter-spacing:-.04em;font-weight:700}
.hx-itp .ip em{font-style:normal;font-weight:500;opacity:.55}
.hx-itp .hx-cta{background:#16140F;color:#ECE7DE}
.hx-itp button{background:transparent;color:#16140F;border:1.5px solid rgba(22,20,15,.28);border-radius:10px;transition:background .2s,color .2s}
.hx-itp button.on{background:#16140F;color:#ECE7DE;border-color:#16140F}
.ip-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px}.ip-opts button{padding:8px 6px;font-size:13px;font-weight:700}
.ip-spec{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.ip-spec li{font-size:13.5px;padding:7px 10px 7px 28px;border-radius:10px;background:rgba(22,20,15,.06);position:relative}
.ip-spec li::before{content:'';position:absolute;left:10px;top:50%;width:8px;height:8px;margin-top:-4px;border-radius:2px;background:#2FB36B}
.ia{display:flex;align-items:center;gap:10px}.ia input{flex:1;accent-color:#16140F}.ia b{font:700 13px var(--mono);white-space:nowrap}
.ia-out{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ia-out span{border:1.5px solid rgba(22,20,15,.25);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column}
.ia-out b{font-size:28px;line-height:1;letter-spacing:-.03em}.ia-out small{font-size:11.5px;opacity:.7}
.ic{display:flex;flex-direction:column;gap:6px}
.ic div{display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center;font-size:13px}
.ic button{padding:5px 10px;font-size:12.5px;font-weight:700}
.ic-res{font-size:13.5px;font-weight:700;padding:8px 10px;border-radius:10px;background:rgba(22,20,15,.06)}
.ic-res.ok{background:rgba(47,179,107,.16);color:#1d6b40}.ic-res.warn{background:rgba(230,120,40,.16);color:#8a4210}
.hx-itp .hx-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.hx-itp .hx-grid button{font-size:12.5px;line-height:1.25;padding:8px;text-align:left}
.ip-det{min-height:2.8em}
/* Sky Duell */
.hx-sky{background:linear-gradient(180deg,#3DA9FF,#7FD3FF 60%,#D6F4FF);color:var(--ink)}
.hx-sky .hx-mono{font:700 11px var(--mono);letter-spacing:.14em}
.hx-sky .hx-cta{background:var(--sun);color:var(--ink);border:3px solid var(--ink);box-shadow:0 4px 0 var(--ink)}
.sk-race{position:relative;height:120px;border:3px solid var(--ink);border-radius:16px;background:rgba(255,255,255,.35);overflow:hidden}
.sk-race i{position:absolute;height:9px;width:60px;border:2.5px solid var(--ink);border-radius:99px;background:#fff;animation:skPl 2.4s linear infinite}
.sk-race i:nth-of-type(1){left:14%;animation-delay:0s}.sk-race i:nth-of-type(2){left:58%;animation-delay:-.6s}.sk-race i:nth-of-type(3){left:30%;animation-delay:-1.2s}.sk-race i:nth-of-type(4){left:70%;animation-delay:-1.8s}
@keyframes skPl{from{top:-14px}to{top:124px}}
.sk-race span{position:absolute;bottom:24px;width:26px;height:26px;border-radius:50%;background:var(--c);border:3px solid var(--ink);animation:skJ .5s cubic-bezier(.3,0,.7,1) infinite alternate}
.sk-a{left:26%}.sk-b{left:62%;animation-delay:-.25s!important}
@keyframes skJ{from{transform:translateY(0) scaleY(.9)}to{transform:translateY(-58px)}}
@media (prefers-reduced-motion:reduce){.hx-fax i[class^=o],.sk-race i,.sk-race span,.hx-itp .hx-mono i{animation:none}}
`;
