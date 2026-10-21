const VERSION = 'seabornia-v4.1';
const PREFIX = 'seabornia-';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const key = url.origin + url.pathname;
  const live = event.request.mode === 'navigate' || /\/(data\/.*\.json|index\.html|sw\.js|manifest\.webmanifest)$/.test(url.pathname);
  const fromNetwork = async () => {
    const response = await fetch(event.request);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const cache = await caches.open(VERSION);
    await cache.put(key, response.clone());
    return response;
  };
  const fromCache = () => caches.match(key);
  if (live) {
    event.respondWith(fromNetwork().catch(async () => {
      const cached = await fromCache();
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const shell = await caches.match(new URL('./index.html', self.registration.scope).href);
        if (shell) return shell;
      }
      return Response.error();
    }));
  } else {
    event.respondWith(fromCache().then(cached => cached || fromNetwork()));
  }
});
