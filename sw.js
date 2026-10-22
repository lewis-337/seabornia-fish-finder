const VERSION = "seabornia-v7.0";
const PREFIX = "seabornia-";
const SHELL = [
  "./",
  "./index.html",
  "./styles-v7.css",
  "./app-v7.js",
  "./map-gestures.js",
  "./fish-areas.js",
  "./data/area_depths.json",
  "./data/fish_areas.json",
  "./trip-conditions.js",
  "./trip-ui.js",
  "./data/conditions.json",
  "./data/tides.json",
  "./manifest.webmanifest",
  "./data/latest.json",
  "./data/photo_manifest.json",
  "./icons/compass-v7.svg",
  "./icons/compass-v7-32.png",
  "./icons/compass-v7-180.png",
  "./icons/compass-v7-192.png",
  "./icons/compass-v7-512.png",
  "./icons/compass-v7-maskable-512.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(async (cache) => {
        await cache.addAll(SHELL);
        const manifest = await cache.match(
          new URL("./data/photo_manifest.json", self.registration.scope).href,
        );
        const data = await manifest.json();
        const photos = Object.values(data.images || {})
          .filter(
            (row) =>
              row.ok &&
              row.license &&
              /^images\/fish\/[\w-]+\.jpg$/.test(row.local),
          )
          .map((row) => "./" + row.local);
        await cache.addAll(photos);
      })
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX) && key !== VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  const key = url.origin + url.pathname;
  const live =
    event.request.mode === "navigate" ||
    /\/(data\/.*\.json|index\.html|sw\.js|manifest\.webmanifest)$/.test(
      url.pathname,
    );
  const fromNetwork = async () => {
    const response = await fetch(event.request);
    if (!response.ok) throw new Error("HTTP " + response.status);
    const cache = await caches.open(VERSION);
    await cache.put(key, response.clone());
    return response;
  };
  const fromCache = async () => (await caches.open(VERSION)).match(key);
  if (live) {
    event.respondWith(
      fromNetwork().catch(async () => {
        const cached = await fromCache();
        if (cached) {
          const offline = new Response(cached.body, {
            status: cached.status,
            statusText: cached.statusText,
            headers: cached.headers,
          });
          offline.headers.set("X-Seabornia-Cache", "offline");
          return offline;
        }
        if (event.request.mode === "navigate") {
          const shell = await (
            await caches.open(VERSION)
          ).match(new URL("./index.html", self.registration.scope).href);
          if (shell) return shell;
        }
        return Response.error();
      }),
    );
  } else {
    event.respondWith(fromCache().then((cached) => cached || fromNetwork()));
  }
});
