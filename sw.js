const VERSION = "seabornia-v10";
const PREFIX = "seabornia-";
const SHELL = [
  "./",
  "./index.html",
  "./styles-v10.css",
  "./app-v10.js",
  "./map-gestures.js",
  "./basemap-v10.js",
  "./vendor/leaflet-1.9.4/leaflet.js",
  "./vendor/leaflet-1.9.4/leaflet.css",
  "./marina-core-v10.js",
  "./marina-discovery-v10.js",
  "./data/marinas.json",
  "./data/marina-evidence.json",
  "./data/coast-regions.json",
  "./data/offline-packs.json",
  "./fish-areas-v10.js",
  "./data/area_depths.json",
  "./data/fish_areas.json",
  "./trip-conditions-v8.js",
  "./trip-ui-v8.js",
  "./data/conditions.json",
  "./data/tides.json",
  "./manifest.webmanifest",
  "./data/latest.json",
  "./data/photo_manifest.json",
  "./icons/compass-v7.svg",
  "./icons/chevron-v8.svg",
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
        const photos = [
          ...new Set(
            Object.values(data.images || {})
              .filter(
                (row) =>
                  row.ok &&
                  row.license &&
                  /^images\/fish\/[\w-]+\.jpg$/.test(row.local),
              )
              .map((row) => "./" + row.local),
          ),
        ];
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
            .filter(
              (key) =>
                key.startsWith(PREFIX) &&
                key !== VERSION &&
                key !== "seabornia-marina-packs-v8",
            )
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
  const fromCache = async () => {
    const own = await (await caches.open(VERSION)).match(key);
    if (own) return own;
    if (
      /\/(data\/.*\.json|images\/maps\/J\d{2}-\d{4}\.jpg)$/.test(url.pathname)
    )
      return (await caches.open("seabornia-marina-packs-v8")).match(key);
  };
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
