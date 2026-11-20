// SKY RUSH Service Worker – offline spielbar (nur Web/PWA)
const V = 'skyrush-v3.0.0';
const ASSETS = ['./', 'index.html', 'core.js', 'config.js', 'monetize.js', 'houseads.js', 'net.js', 'meta.js', 'bot.js', 'i18n.js', 'pad.js', 'remote.js', 'shopcfg.js', 'channel.js', 'portal.js', 'economy.js', 'catalog.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'fonts/space-grotesk-latin-500-normal.woff2',
  'fonts/space-grotesk-latin-700-normal.woff2', 'fonts/jetbrains-mono-latin-500-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.endsWith('admin.html')) return; // Server, Zentrale & Werbung nie cachen
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));   // nur gültige Antworten speichern (kein Fehlerseiten-Cache)
});
