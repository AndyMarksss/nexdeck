const cacheName = 'nexdeck-shell-v8';
const shell = ['/', '/app.js', '/pairing.js', '/qr-decoder.js', '/style.css', '/icon.svg', '/icon-192.png',
  '/icon-512.png', '/manifest.json', '/fa-solid-900.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shell)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('nexdeck-shell-') && name !== cacheName)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !shell.includes(url.pathname)) return;
  event.respondWith(fetch(request).catch(async () =>
    (await caches.open(cacheName)).match(request.mode === 'navigate' ? '/' : url.pathname)));
});
