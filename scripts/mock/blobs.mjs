// Speicher-Attrappe für Tests der Netlify Functions (ersetzt @netlify/blobs im Arbeitsspeicher)
const data = new Map(); let v = 0;
export const __data = data;
export function getStore() {
  return {
    async get(k, o) { const e = data.get(k); return e ? structuredClone(e.val) : null; },
    async getWithMetadata(k) { const e = data.get(k); return e ? { data: structuredClone(e.val), etag: e.etag } : null; },
    async setJSON(k, val, o = {}) {
      const e = data.get(k);
      if (o.onlyIfNew && e) return { modified: false };
      if (o.onlyIfMatch && (!e || e.etag !== o.onlyIfMatch)) return { modified: false };
      data.set(k, { val: structuredClone(val), etag: 'e' + (++v) }); return { modified: true };
    },
    async delete(k) { data.delete(k); },
    async list(o = {}) { const pre = o.prefix || ''; return { blobs: [...data.entries()].filter(([k]) => k.startsWith(pre)).map(([key, e]) => ({ key, etag: e.etag })), directories: [] }; },
  };
}
