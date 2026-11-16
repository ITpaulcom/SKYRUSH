// Gemeinsame Helfer für die Netlify Functions: Speicher (Netlify Blobs), Antworten, Spieler-Prüfung.
import { getStore } from '@netlify/blobs';

export const store = () => getStore({ name: 'skyrush', consistency: 'strong' });

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
export const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } });
export const preflight = req => (req.method === 'OPTIONS' ? new Response('', { status: 204, headers: cors }) : null);

// Lesen–Ändern–Schreiben ohne Datenverlust bei gleichzeitigen Zugriffen (bedingtes Schreiben per ETag)
export async function update(key, fn, tries = 10) {
  const st = store();
  for (let i = 0; i < tries; i++) {
    const cur = await st.getWithMetadata(key, { type: 'json' });
    const next = await fn(cur ? cur.data : null);
    if (next === undefined) return cur ? cur.data : null;
    const res = await st.setJSON(key, next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified !== false) return next;
    await new Promise(r => setTimeout(r, 20 + Math.random() * 80 * (i + 1)));
  }
  throw new Error('busy');
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

export const validUid = u => typeof u === 'string' && /^[a-f0-9-]{36}$/.test(u);
export const validSecret = s => typeof s === 'string' && /^[a-f0-9]{32,64}$/.test(s);
export const cleanName = n => String(n || '').trim().replace(/[^\p{L}\p{N}_\- .]/gu, '').slice(0, 16);
export const cleanCountry = c => (typeof c === 'string' && /^[A-Z]{2}$/.test(c) ? c : null);

// Spieler prüfen bzw. beim ersten Kontakt anlegen. Gibt das Spieler-Objekt zurück oder null.
export async function auth(uid, secret, { name, country } = {}) {
  if (!validUid(uid) || !validSecret(secret)) return null;
  const hash = await sha256(secret);
  let ok = false;
  const p = await update(`players/${uid}`, cur => {
    if (cur) {
      if (cur.hash !== hash && !(Array.isArray(cur.hashes) && cur.hashes.includes(hash))) return undefined; // falsches Geheimnis → nichts ändern (weitere Geräte über Google-Konto: hashes)
      ok = true;
      const n = name !== undefined ? cleanName(name) : cur.name;
      const c = country !== undefined ? cleanCountry(country) : cur.country;
      if (n === cur.name && c === cur.country) return undefined;
      return { ...cur, name: n.length >= 3 ? n : cur.name, country: c, updated: Date.now() };
    }
    ok = true;
    const n = cleanName(name);
    return { hash, name: n.length >= 3 ? n : 'Spieler' + uid.slice(0, 4).toUpperCase(), country: cleanCountry(country), created: Date.now() };
  });
  return ok ? p : null;
}
