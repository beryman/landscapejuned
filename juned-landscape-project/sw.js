/* Juned Landscape Project - service worker (offline + pembaruan terkontrol) */
const VERSION = '1.0.2';
const CACHE = 'jlp-' + VERSION;
const RUNTIME = 'jlp-runtime';
const CORE = [
  './', 'index.html', 'manifest.webmanifest',
  'shell.css', 'shell-core.js', 'shell-pages.js', 'shell-bridge.js',
  'lib/kv.js', 'lib/common.js', 'lib/embed.css', 'lib/xlsx.full.min.js',
  'apps/proyek.html', 'apps/tanaman.html', 'apps/keuangan.html',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/logo-96.png'
];
const CDN = ['cdn.jsdelivr.net', 'unpkg.com', 'tessdata.projectnaptha.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('jlp-') && k !== CACHE && k !== RUNTIME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then(r => { if (r && r.ok && r.type === 'basic') cache.put(req.mode === 'navigate' ? 'index.html' : req, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const r = await net;
      if (r) return r;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    })());
    return;
  }
  if (CDN.includes(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; } catch (_) { return Response.error(); }
    })());
  }
});
