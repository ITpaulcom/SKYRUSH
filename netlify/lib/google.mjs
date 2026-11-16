// Google-Anmeldung prüfen: Das ID-Token (JWT) von „Mit Google anmelden“ wird hier selbst nachgeprüft –
// Signatur mit Googles öffentlichen Schlüsseln, Aussteller, Empfänger (unsere Client-ID) und Ablaufzeit.
const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISS = new Set(['accounts.google.com', 'https://accounts.google.com']);
let keys = null, keysUntil = 0;

const b64u = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const dec = s => JSON.parse(new TextDecoder().decode(b64u(s)));

async function loadKeys(fetchFn, force = false) {
  if (!force && keys && Date.now() < keysUntil) return keys;
  const r = await fetchFn(CERTS);
  if (!r.ok) throw new Error('certs');
  const j = await r.json();
  const age = Number((String(r.headers && r.headers.get ? r.headers.get('cache-control') || '' : '').match(/max-age=(\d+)/) || [])[1]) || 3600;
  keys = j.keys || []; keysUntil = Date.now() + Math.min(age, 6 * 3600) * 1000;
  return keys;
}

// → { sub, email, verified, name } oder Fehler (Error mit message)
export async function verifyGoogle(token, clientId, fetchFn = globalThis.fetch) {
  if (!clientId) throw new Error('off');
  const p = String(token || '').split('.');
  if (p.length !== 3 || token.length > 4096) throw new Error('format');
  let head, pay;
  try { head = dec(p[0]); pay = dec(p[1]); } catch { throw new Error('format'); }
  if (head.alg !== 'RS256' || !head.kid) throw new Error('alg');
  let jwk = (await loadKeys(fetchFn)).find(k => k.kid === head.kid);
  if (!jwk) jwk = (await loadKeys(fetchFn, true)).find(k => k.kid === head.kid);   // Google hat die Schlüssel gewechselt
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(p[2]), new TextEncoder().encode(p[0] + '.' + p[1]));
  if (!ok) throw new Error('sig');
  const now = Date.now() / 1000;
  if (!ISS.has(pay.iss)) throw new Error('iss');
  if ((Array.isArray(pay.aud) ? !pay.aud.includes(clientId) : pay.aud !== clientId)) throw new Error('aud');
  if (!(pay.exp > now - 60) || (pay.iat && pay.iat > now + 300)) throw new Error('exp');
  if (typeof pay.sub !== 'string' || !/^\d{5,40}$/.test(pay.sub)) throw new Error('sub');
  return { sub: pay.sub, email: typeof pay.email === 'string' ? pay.email.slice(0, 120) : '', verified: pay.email_verified === true || pay.email_verified === 'true', name: typeof pay.name === 'string' ? pay.name.slice(0, 60) : '' };
}
// E-Mail für die Anzeige im Spiel kürzen: paul@gmail.com → p•••@gmail.com
export const maskEmail = e => { const [a, d] = String(e || '').split('@'); return d ? `${a.slice(0, 1)}•••@${d}` : ''; };
