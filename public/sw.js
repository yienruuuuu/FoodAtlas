const CACHE = 'food-atlas-shell-v1';
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(['/','/manifest.webmanifest']);
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try { const response = await fetch(event.request); if (response.ok) (await caches.open(CACHE)).put(event.request, response.clone()); return response; }
    catch { return (await caches.match(event.request)) || (await caches.match('/')); }
  })());
});
