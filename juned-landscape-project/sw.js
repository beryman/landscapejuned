/* Juned Landscape Project - service worker (offline + pembaruan terkontrol) */
const VERSION = '1.8.2';
const CACHE = 'jlp-' + VERSION;
const RUNTIME = 'jlp-runtime';
// Naikkan HANYA saat apps/survei dibangun ulang: bundelnya besar dan berkasnya harus dari build yang sama.
const SURVEI = 'jlp-survei-4';
const CORE = [
  './', 'index.html', 'config.js', 'manifest.webmanifest',
  'shell.css', 'shell-core.js', 'shell-pages.js', 'shell-bridge.js', 'shell-sync.js', 'shell-onedrive.js', 'shell-gdrive.js', 'shell-space.js',
  'lib/kv.js', 'lib/common.js', 'lib/survei-calc.js', 'lib/sync-merge.js', 'lib/proyek-logic.js', 'lib/gemini-plant.js', 'lib/gdrive-backup.js', 'lib/embed.css', 'lib/xlsx.full.min.js',
  'apps/proyek.html', 'apps/tanaman.html',
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
    await Promise.all(keys.filter(k => k.startsWith('jlp-') && ![CACHE, RUNTIME, SURVEI].includes(k)).map(k => caches.delete(k)));
    const rt = await caches.open(RUNTIME);   // versi 1.3.1-1.5.0 menyimpan Survei di sini
    await Promise.all((await rt.keys()).filter(r => r.url.includes('/apps/survei/')).map(r => rt.delete(r)));
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
      const cache = await caches.open(url.pathname.includes('/apps/survei/') ? SURVEI : CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      // hanya halaman utama yang memakai kunci index.html; iframe modul (destination 'iframe') disimpan dengan alamatnya sendiri
      const top = req.destination === 'document';
      const net = fetch(req).then(r => { if (r && r.ok && r.type === 'basic') cache.put(top ? 'index.html' : req, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const r = await net;
      if (r) return r;
      if (top) return (await cache.match('index.html')) || Response.error();
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
