// SKY RUSH – Mehrsprachigkeit.
// Das Spiel ist auf Deutsch geschrieben; dieses Modul übersetzt alles Sichtbare automatisch in die gewählte Sprache:
// • Texte im Menü (DOM) über einen MutationObserver – auch alles, was später per innerHTML/textContent entsteht
// • Texte im Spielfeld (Canvas fillText/strokeText/measureText)
// Übersetzungen liegen in /lang/<code>.json als { "Deutscher Text mit {}": "Translation with {0}" }.
// {} im Schlüssel = veränderlicher Teil (Zahl, Name …); {0}, {1} … in der Übersetzung = derselbe Teil in beliebiger Reihenfolge.

export const LANGS = {
  de: 'Deutsch', en: 'English', es: 'Español', fr: 'Français', it: 'Italiano', pt: 'Português',
  tr: 'Türkçe', pl: 'Polski', id: 'Bahasa Indonesia', ja: '日本語', ko: '한국어',
};
const LOCALE = { de: 'de-DE', en: 'en-US', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', pt: 'pt-BR', tr: 'tr-TR', pl: 'pl-PL', id: 'id-ID', ja: 'ja-JP', ko: 'ko-KR' };
const KEY = 'skyrush.lang';

export let lang = 'de';
let exact = new Map(), patterns = [], cache = new Map();

export function detectLang() {
  // ?lang=xx (z. B. von den Info-Seiten /de/, /en/ …) wählt die Sprache und merkt sie sich
  try { const q = new URLSearchParams(location.search).get('lang'); if (q && LANGS[q]) { localStorage.setItem(KEY, q); return q; } } catch {}
  try { const s = localStorage.getItem(KEY); if (s && LANGS[s]) return s; } catch {}
  for (const l of navigator.languages || [navigator.language || 'en']) { const c = String(l).slice(0, 2).toLowerCase(); if (LANGS[c]) return c; }
  return 'en';
}
export const locale = () => LOCALE[lang] || 'en-US';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function build(dict) {
  exact = new Map(); patterns = []; cache = new Map();
  for (const [k, v] of Object.entries(dict)) {
    if (!v) continue;
    if (!k.includes('{}')) { exact.set(k, v); continue; }
    const parts = k.split('{}');
    patterns.push({ re: new RegExp('^' + parts.map(esc).join('([\\s\\S]*?)') + '$'), out: v, lit: parts.join('').length });
  }
  patterns.sort((a, b) => b.lit - a.lit);   // spezifischere Muster zuerst
}

// Übersetzt einen ganzen Text (Leerraum am Rand bleibt erhalten). Unbekanntes bleibt unverändert.
export function tr(s) {
  if (lang === 'de' || typeof s !== 'string' || !s) return s;
  const hit = cache.get(s); if (hit !== undefined) return hit;
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/), core = m[2];
  let out = core ? one(core, 0) : core;
  if (out === core && window.__i18nMiss && /[A-Za-zÄÖÜäöüß]{2}/.test(core)) window.__i18nMiss.add(core);
  out = m[1] + out + m[3];
  if (cache.size > 5000) cache.clear();
  cache.set(s, out);
  return out;
}
function one(t, depth) {
  const e = exact.get(t); if (e !== undefined) return e;
  if (depth > 2 || !/[A-Za-zÄÖÜäöüß]/.test(t)) return t;
  // Römische Ziffer am Ende („Himmelsstürmer III“, „Sternennebel II“): Namen übersetzen, Ziffer behalten
  const rn = t.match(/^(.+?) ((?:X|IX|IV|V?I{0,3}))$/);
  if (rn && rn[2]) { const b = one(rn[1], depth + 1); if (b !== rn[1]) return b + ' ' + rn[2]; }
  for (const p of patterns) {
    const m = t.match(p.re); if (!m) continue;
    const g = m.slice(1).map(x => { const w = x.match(/^(\s*)([\s\S]*?)(\s*)$/); return w[1] + one(w[2], depth + 1) + w[3]; });
    return p.out.replace(/\{(\d)\}/g, (_, i) => g[+i] ?? '');
  }
  // Symbole/Emojis am Rand abtrennen („👑 Goldenes Himmelstor“) und Aufzählungen mit „ · “ einzeln übersetzen
  const sym = t.match(/^([^\p{L}\p{N}]+)?([\s\S]*?)([^\p{L}\p{N}]+)?$/u);
  if (sym && (sym[1] || sym[3]) && sym[2]) { const c = one(sym[2], depth + 1); if (c !== sym[2]) return (sym[1] || '') + c + (sym[3] || ''); }
  if (t.includes(' · ')) { const parts = t.split(' · '), o = parts.map(x => one(x, depth + 1)); if (o.some((x, i) => x !== parts[i])) return o.join(' · '); }
  return t;
}

// ---------- DOM ----------
const ATTRS = ['title', 'placeholder', 'aria-label'];
function walk(node) {
  if (node.nodeType === 3) { const v = node.data, t = tr(v); if (t !== v) node.data = t; return; }
  if (node.nodeType !== 1 || node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE' || node.nodeName === 'CANVAS') return;
  for (const a of ATTRS) { const v = node.getAttribute(a); if (v) { const t = tr(v); if (t !== v) node.setAttribute(a, t); } }
  if ((node.nodeName === 'INPUT' && (node.type === 'button' || node.type === 'submit')) && node.value) node.value = tr(node.value);
  for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
}
let obs = null;
function observe() {
  if (obs || lang === 'de') return;
  walk(document.body); document.title = tr(document.title);
  obs = new MutationObserver(list => {
    for (const r of list) {
      if (r.type === 'characterData') walk(r.target);
      else if (r.type === 'attributes') walk(r.target);
      else r.addedNodes.forEach(walk);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// ---------- Canvas ----------
let patched = false;
function patchCanvas() {
  if (patched) return; patched = true;
  const P = CanvasRenderingContext2D.prototype;
  for (const fn of ['fillText', 'strokeText', 'measureText']) {
    const orig = P[fn];
    P[fn] = function (text, ...rest) { return orig.call(this, typeof text === 'string' ? tr(text) : text, ...rest); };
  }
}

// Sprache laden (vor dem ersten Bild) – fällt bei Problemen still auf Deutsch zurück
export async function initI18n(code = detectLang()) {
  lang = LANGS[code] ? code : 'en';
  document.documentElement.lang = lang;
  if (lang === 'de') return;
  try {
    const r = await fetch(`./lang/${lang}.json`);
    build(await r.json());
    patchCanvas();
    if (document.body) observe(); else addEventListener('DOMContentLoaded', observe, { once: true });
  } catch { lang = 'de'; document.documentElement.lang = 'de'; }
}
// Sprachwechsel: merken und neu laden (sauberster Weg, alles neu aufzubauen)
export function setLang(code) {
  try { localStorage.setItem(KEY, code); } catch {}
  location.reload();
}
