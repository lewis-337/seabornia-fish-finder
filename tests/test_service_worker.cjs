const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function worker({ offline = false } = {}) {
  const handlers = {}, saved = new Map(), deleted = [];
  const cache = { addAll: async () => {}, put: async (key, value) => saved.set(key, value) };
  const context = {
    URL, Response,
    self: { location: { origin: 'https://example.com' }, registration: { scope: 'https://example.com/fishing/' }, skipWaiting: async () => {}, clients: { claim: async () => {} }, addEventListener: (name, fn) => handlers[name] = fn },
    caches: { open: async () => cache, match: async key => saved.get(key), keys: async () => ['unrelated-app', 'seabornia-v4', 'seabornia-v4.1'], delete: async key => deleted.push(key) },
    fetch: async () => { if (offline) throw Error('offline'); return new Response('fresh'); },
  };
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), context);
  const request = async (path, mode = 'cors') => {
    let response;
    handlers.fetch({ request: { method: 'GET', url: 'https://example.com/fishing/' + path, mode }, respondWith: value => response = value });
    return await response;
  };
  return { handlers, saved, deleted, request };
}

test('offline refresh finds JSON cached under a different timestamp', async () => {
  const live = worker();
  await live.request('data/latest.json?ts=1');
  const offline = worker({ offline: true });
  offline.saved.set('https://example.com/fishing/data/latest.json', live.saved.get('https://example.com/fishing/data/latest.json'));
  assert.equal(await (await offline.request('data/latest.json?ts=2')).text(), 'fresh');
});

test('activation preserves other apps caches on the same origin', async () => {
  const app = worker(); let done;
  app.handlers.activate({ waitUntil: value => done = value }); await done;
  assert.deepEqual(app.deleted, ['seabornia-v4']);
});

test('online navigation updates a previously cached app shell', async () => {
  const app = worker();
  app.saved.set('https://example.com/fishing/index.html', new Response('old'));
  assert.equal(await (await app.request('index.html', 'navigate')).text(), 'fresh');
});
