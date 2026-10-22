const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

function worker({ offline = false, foreign = new Map() } = {}) {
  const handlers = {},
    saved = new Map(),
    deleted = [],
    added = [];
  const cache = {
    addAll: async (names) => {
      for (const name of names) {
        added.push(name);
        const key = new URL(name, "https://example.com/fishing/").href;
        saved.set(
          key,
          new Response(
            name.endsWith("photo_manifest.json")
              ? JSON.stringify({
                  images: {
                    good: {
                      ok: true,
                      license: "CC BY",
                      local: "images/fish/0.jpg",
                    },
                    unknown: { ok: true, local: "images/fish/1.jpg" },
                  },
                })
              : "shell",
          ),
        );
      }
    },
    match: async (key) => saved.get(key)?.clone(),
    put: async (key, value) => saved.set(key, value),
  };
  const context = {
    URL,
    Response,
    self: {
      location: { origin: "https://example.com" },
      registration: { scope: "https://example.com/fishing/" },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      addEventListener: (name, fn) => (handlers[name] = fn),
    },
    caches: {
      open: async () => cache,
      match: async (key) => (saved.get(key) || foreign.get(key))?.clone(),
      keys: async () => [
        "unrelated-app",
        "seabornia-v4",
        "seabornia-v4.1",
        "seabornia-v4.2",
        "seabornia-v5.0",
        "seabornia-v6.0",
      ],
      delete: async (key) => deleted.push(key),
    },
    fetch: async () => {
      if (offline) throw Error("offline");
      return new Response("fresh");
    },
  };
  vm.runInNewContext(fs.readFileSync("sw.js", "utf8"), context);
  const request = async (path, mode = "cors") => {
    let response;
    handlers.fetch({
      request: {
        method: "GET",
        url: "https://example.com/fishing/" + path,
        mode,
      },
      respondWith: (value) => (response = value),
    });
    return await response;
  };
  return { handlers, saved, deleted, added, request };
}

test("offline refresh finds JSON cached under a different timestamp", async () => {
  const live = worker();
  await live.request("data/latest.json?ts=1");
  const offline = worker({ offline: true });
  offline.saved.set(
    "https://example.com/fishing/data/latest.json",
    live.saved.get("https://example.com/fishing/data/latest.json"),
  );
  assert.equal(
    await (await offline.request("data/latest.json?ts=2")).text(),
    "fresh",
  );
});

test("activation preserves other apps caches on the same origin", async () => {
  const app = worker();
  let done;
  app.handlers.activate({ waitUntil: (value) => (done = value) });
  await done;
  assert.deepEqual(app.deleted, [
    "seabornia-v4",
    "seabornia-v4.1",
    "seabornia-v4.2",
    "seabornia-v5.0",
  ]);
});

test("online navigation updates a previously cached app shell", async () => {
  const app = worker();
  app.saved.set("https://example.com/fishing/index.html", new Response("old"));
  assert.equal(
    await (await app.request("index.html", "navigate")).text(),
    "fresh",
  );
});

test("install caches the new modules, data and licensed catalogue images", async () => {
  const app = worker();
  let done;
  app.handlers.install({ waitUntil: (value) => (done = value) });
  await done;
  for (const asset of [
    "./app-v6.js",
    "./styles-v6.css",
    "./map-gestures.js",
    "./trip-conditions.js",
    "./trip-ui.js",
    "./data/conditions.json",
    "./data/tides.json",
    "./data/latest.json",
    "./data/photo_manifest.json",
    "./images/fish/0.jpg",
  ])
    assert.ok(app.added.includes(asset), asset);
  assert.ok(!app.added.includes("./images/fish/1.jpg"));
});
test("offline navigation to an uncached path falls back to the app shell", async () => {
  const app = worker({ offline: true });
  app.saved.set(
    "https://example.com/fishing/index.html",
    new Response("app shell"),
  );
  assert.equal(
    await (await app.request("unknown", "navigate")).text(),
    "app shell",
  );
});
test("cached JSON is explicitly labelled so checking a cache cannot imply a fresh collection", async () => {
  const app = worker({ offline: true });
  app.saved.set(
    "https://example.com/fishing/data/latest.json",
    new Response("{}"),
  );
  assert.equal(
    (await app.request("data/latest.json?ts=999")).headers.get(
      "X-Seabornia-Cache",
    ),
    "offline",
  );
});

// A retired worker can finish a request after activation and recreate its old cache.
test("current worker never reads a retired worker cache", async () => {
  const foreign = new Map([
    [
      "https://example.com/fishing/app-v6.js",
      new Response("stale retired asset"),
    ],
  ]);
  const app = worker({ foreign });
  assert.equal(await (await app.request("app-v6.js")).text(), "fresh");
});
