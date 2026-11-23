// Sky Duell – Info-Seiten: Live-Spiel im Handy-Rahmen, Hops hüpft über die Seite (Münzen sammeln), Live-Rangliste.
// Kein Framework, keine Tracker. Läuft auch ohne JavaScript nicht schlechter: alle Inhalte stehen im HTML.
(() => {
  const T = JSON.parse(document.getElementById('site-i18n')?.textContent || '{}');
  const lang = document.documentElement.lang.slice(0, 2);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = n => new Intl.NumberFormat(document.documentElement.lang).format(n);

  // ---------- 1) Live-Spiel im Handy-Rahmen ----------
  const demo = $('[data-demo]');
  if (demo) demo.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    const url = demo.dataset.demo;
    if (innerWidth < 760) { location.href = url; return; }   // auf dem Handy direkt im Vollbild
    demo.classList.add('live');
    demo.querySelector('.screen').innerHTML = `<iframe src="${url}" title="Sky Duell" allow="autoplay; fullscreen; gamepad" loading="eager"></iframe>`;
    demo.querySelector('iframe').focus();
    window.hops?.cheer();
  });

  // ---------- 2) Live-Rangliste ----------
  const lb = $('[data-lb]');
  if (lb) fetch('/api/leaderboard?mode=endless&period=all').then(r => r.ok ? r.json() : null).then(j => {
    const top = (j?.top || []).filter(e => e.name && e.height > 0).slice(0, 5);
    if (!top.length) return;
    const medal = ['🥇', '🥈', '🥉', '4', '5'];
    lb.querySelector('ol').innerHTML = top.map((e, i) => `<li><span class="r">${medal[i]}</span><span class="n"></span><b>${fmt(Math.floor(e.height))} m</b></li>`).join('');
    lb.querySelectorAll('.n').forEach((el, i) => el.textContent = top[i].name);   // Namen als Text, nie als HTML
    lb.hidden = false;
    // Live-Rekord im Kopf (echte Daten aus der Rangliste)
    const lt = $('[data-top]');
    if (lt) { lt.querySelector('b').textContent = top[0].name; lt.querySelector('span').textContent = fmt(Math.floor(top[0].height)) + ' m'; lt.hidden = false; }
  }).catch(() => {});

  // ---------- 3) Hops hüpft über die Seite ----------
  // Flüssig auf allen Geräten: nur transform/opacity werden animiert (kein Layout pro Bild), Positionen werden erst nach
  // Layout-Änderungen (Bilder geladen, Fenstergröße) gebündelt neu gemessen, Münzen werden dabei nur verschoben, nie neu angelegt.
  const KEY = 'skyrush.hop.' + location.pathname;
  let off = false; try { off = localStorage.getItem('skyrush.hop.off') === '1'; } catch {}
  const els = $$('[data-hop]');
  const measure = () => els.map(el => {
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return null;
    const r = el.getBoundingClientRect();
    return { el, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  });
  let P = measure();
  const small = innerWidth < 600, W = small ? 44 : 53, H = small ? 49 : 59, BOUNCE = small ? 10 : 14;
  const hop = document.createElement('div'); hop.className = 'hops'; hop.setAttribute('aria-hidden', 'true');
  hop.innerHTML = `<div class="hops-b"><img src="/site/img/hops.png" alt="" width="${W}" height="${H}" decoding="async"></div><div class="hops-sh"></div>`;
  const body = hop.firstChild, img = body.firstChild, shadow = hop.lastChild;
  const ui = document.createElement('div'); ui.className = 'hop-ui';
  ui.innerHTML = `<span class="hop-c"><img src="/site/img/coin.svg" alt="" width="20" height="20"><b data-n>0</b>/<span data-t>0</span></span><button type="button" data-toggle></button>`;
  document.body.append(hop, ui);
  const nEl = ui.querySelector('[data-n]'), tEl = ui.querySelector('[data-t]'), cEl = ui.querySelector('.hop-c');
  let cur = -1, pos = { x: 0, y: 0 }, anim = null, coins = [], got = new Set();
  try { JSON.parse(sessionStorage.getItem(KEY) || '[]').forEach(i => got.add(i)); } catch {}
  const pop = (el, frames, ms) => { try { el.animate(frames, { duration: ms, easing: 'ease-out' }); } catch {} };   // ohne erzwungenes Neu-Layout

  // Münzen einmal anlegen; bei Layout-Änderungen nur verschieben
  els.forEach((el, i) => {
    if (!el.hasAttribute('data-coin')) return;
    const c = { i, el: document.createElement('div'), x: 0, y: 0, f: .5 + (((i * 37) % 7) - 3) / 14 };
    c.el.className = 'hop-coin' + (got.has(i) ? ' got' : ''); c.el.innerHTML = '<img src="/site/img/coin.svg" alt="" width="26" height="26">';
    document.body.appendChild(c.el); coins.push(c);
  });
  const placeCoins = () => {
    for (const c of coins) {
      const p = P[c.i]; if (!p) { c.el.style.display = 'none'; continue; }
      c.el.style.display = ''; c.x = p.x + p.w * c.f; c.y = p.y - 9;
      c.el.style.transform = `translate3d(${c.x - 13}px,${c.y - 13}px,0)`;
    }
    const vis = coins.filter(c => P[c.i]);   // nur sichtbare Münzen zählen (z. B. Rangliste ohne Daten ist ausgeblendet)
    tEl.textContent = vis.length; nEl.textContent = vis.filter(c => got.has(c.i)).length;
  };
  const draw = (sx = 1, sy = 1) => {
    hop.style.transform = `translate3d(${pos.x - W / 2}px,${pos.y - H}px,0)`;
    img.style.transform = sx === 1 && sy === 1 ? '' : `scale(${sx},${sy})`;
  };
  function collect() {
    for (const c of coins) {
      if (got.has(c.i) || c.el.style.display === 'none') continue;
      if (Math.abs(c.x - pos.x) < 36 && c.y > pos.y - H - 10 && c.y < pos.y + 16) {
        got.add(c.i); c.el.classList.add('got');
        try { sessionStorage.setItem(KEY, JSON.stringify([...got])); } catch {}
        const vis = coins.filter(k => P[k.i]), n = vis.filter(k => got.has(k.i)).length;
        nEl.textContent = n; pop(cEl, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], 350);
        if (n === vis.length) setTimeout(done, 500);
      }
    }
  }
  function jumpTo(i, tx) {
    const p = P[i]; if (!p) return;
    const coin = coins.find(c => c.i === i && !got.has(c.i));   // ungesammelte Münze? Dann genau dort landen
    const to = { x: Math.max(p.x + 24, Math.min(p.x + p.w - 24, tx ?? (coin ? coin.x : p.x + p.w * (.6 + Math.random() * .3)))), y: p.y };
    if (reduce) { pos = to; cur = i; draw(); collect(); return; }
    const from = { ...pos }, d = Math.hypot(to.x - from.x, to.y - from.y);
    const dur = Math.min(900, 360 + d * .4), peak = Math.min(from.y, to.y) - Math.max(70, Math.min(220, d * .3));
    anim = { from, to, peak, t0: performance.now(), dur, i };
    shadow.style.opacity = '0';
  }
  let running = false;
  function frame(now) {
    running = false;
    if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.dur), { from, to, peak } = anim;
      // Parabel durch Start, Gipfel und Ziel; waagerecht weich beschleunigt
      const a = from.y, c = to.y, m = 2 * peak - (a + c) / 2, y = (1 - k) * (1 - k) * a + 2 * (1 - k) * k * m + k * k * c;
      const kx = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      pos = { x: from.x + (to.x - from.x) * kx, y };
      draw(k < .5 ? .9 : .95, k < .5 ? 1.12 : 1.05); collect();
      if (k >= 1) { cur = anim.i; anim = null; shadow.style.opacity = ''; land(); }
    } else if (!reduce && cur >= 0 && P[cur]) {
      const t = (now / 1000) % 1.1, b = t < .45 ? Math.sin(t / .45 * Math.PI) * BOUNCE : 0;   // kleines Hüpfen auf der Stelle
      pos.y = P[cur].y - b;
      draw(t > .45 && t < .55 ? 1.12 : 1, t > .45 && t < .55 ? .88 : 1);
    }
    if (!off && !document.hidden) tick();
  }
  const tick = () => { if (!running) { running = true; requestAnimationFrame(frame); } };
  function land() {
    pop(body, [{ transform: 'scale(1.25,.72)' }, { transform: 'scale(.92,1.1)', offset: .6 }, { transform: 'none' }], 300);
    const p = P[cur]; if (p) pop(p.el, [{ translate: '0 0' }, { translate: '0 5px', offset: .3 }, { translate: '0 0' }], 350);
    collect();
  }
  function pickByScroll() {
    if (anim || off) return;
    const line = scrollY + innerHeight * .42;
    let best = -1, bd = 1e9;
    P.forEach((p, i) => { if (!p || p.y < scrollY + 60 || p.y > scrollY + innerHeight - 40) return; const d = Math.abs(p.y - line); if (d < bd) { bd = d; best = i; } });
    if (best >= 0 && best !== cur) jumpTo(best);
  }
  function done() {
    const m = document.createElement('div'); m.className = 'hop-done';
    m.innerHTML = `<div class="card"><img src="/site/img/hops.png" alt="" width="80" height="89"><h2></h2><p></p><a class="btn go big" href="/?lang=${lang}">▶ </a><button type="button" class="btn sm" data-x>OK</button></div>`;
    m.querySelector('h2').textContent = T.hop_done_h || 'Alle Münzen gesammelt!';
    m.querySelector('p').textContent = T.hop_done_t || '';
    m.querySelector('a').append(T.play || 'Sky Duell');
    m.querySelector('[data-x]').onclick = () => m.remove();
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
    for (let i = 0; i < 40; i++) { const s = document.createElement('i'); s.className = 'conf'; s.style.cssText = `left:${Math.random() * 100}%;--d:${.8 + Math.random() * 1.4}s;--r:${Math.random() * 720 - 360}deg;background:${['#FFC83D', '#FF5A7A', '#38C6FF', '#3BE8A4', '#7B4DFF'][i % 5]}`; m.appendChild(s); }
  }
  function setOff(v) {
    off = v; try { localStorage.setItem('skyrush.hop.off', v ? '1' : '0'); } catch {}
    document.body.classList.toggle('hop-off', v); document.body.classList.toggle('hop-on', !v);
    ui.querySelector('[data-toggle]').textContent = v ? (T.hop_show || 'Hops zeigen') : '✕';
    ui.querySelector('[data-toggle]').title = v ? '' : (T.hop_hide || 'Hops ausblenden');
    if (!v) { relayout(); pickByScroll(); tick(); }
  }
  // Neu messen – gebündelt, höchstens einmal pro Bild, nur wenn sich das Layout wirklich geändert hat
  let rl = 0;
  function relayout() {
    P = measure(); placeCoins();
    const p = P[cur];
    if (p) { pos.y = p.y; pos.x = Math.max(p.x + 24, Math.min(p.x + p.w - 24, pos.x)); if (!anim) draw(); }
  }
  const queueRelayout = () => { if (!rl) rl = requestAnimationFrame(() => { rl = 0; relayout(); }); };
  // Start: auf dem Handy im Kopf
  document.body.classList.toggle('hop-on', !off);
  P = measure();
  const start = P.findIndex(p => p && p.el.matches('.phone'));
  cur = start >= 0 ? start : P.findIndex(Boolean);
  if (P[cur]) pos = { x: P[cur].x + P[cur].w * .7, y: P[cur].y };
  placeCoins(); draw(); setOff(off);
  let sr = 0; addEventListener('scroll', () => { if (!sr) sr = requestAnimationFrame(() => { sr = 0; pickByScroll(); tick(); }); }, { passive: true });
  addEventListener('resize', queueRelayout);
  new ResizeObserver(queueRelayout).observe(document.body);
  addEventListener('load', queueRelayout);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !off) tick(); });
  ui.querySelector('[data-toggle]').onclick = () => setOff(!off);
  // Tipp auf eine Karte: Hops springt genau dorthin
  document.addEventListener('click', e => {
    if (off || e.target.closest('a,button,summary,iframe,textarea,input,[data-demo]')) return;
    const el = e.target.closest('[data-hop]'); if (!el) return;
    const i = els.indexOf(el); if (i >= 0 && P[i]) { jumpTo(i, e.pageX); tick(); }
  });
  window.hops = { cheer: () => pop(body, [{ transform: 'scale(1.25,.72)' }, { transform: 'scale(.92,1.1)', offset: .6 }, { transform: 'none' }], 300) };
  if (T.hop_hint && !sessionStorage.getItem('skyrush.hop.hint')) {
    const h = document.createElement('div'); h.className = 'hop-tip'; h.textContent = T.hop_hint; ui.appendChild(h);
    setTimeout(() => h.remove(), 6500); try { sessionStorage.setItem('skyrush.hop.hint', '1'); } catch {}
  }
})();
