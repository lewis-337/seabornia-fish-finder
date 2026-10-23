const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  M = require("../marina-core-v8.3.js"),
  T = require("../trip-conditions-v8.js");
test("untagged legacy records stay Seabornia; editing another base preserves them", () => {
  const old = [{ id: "legacy" }, { id: "b", marinaId: "J47-0010" }];
  assert.deepEqual(M.mine(old, M.HOME), [{ id: "legacy" }]);
  const merged = M.merge(old, [{ id: "new" }], "J47-0010");
  assert.deepEqual(merged, [
    { id: "legacy" },
    { id: "new", marinaId: "J47-0010" },
  ]);
});
test("legacy import replaces only Seabornia and ignores incoming marina tags", () => {
  const result = M.backupRecords(
    {
      version: 5,
      waypoints: [{ id: "import", marinaId: "J47-0020" }],
      catches: [],
    },
    [{ id: "keep", marinaId: "J47-0010" }, { id: "old" }],
    [],
  );
  assert.equal(result.points[0].id, "keep");
  assert.equal(result.points[1].marinaId, M.HOME);
});
test("Mercator projection round-trips each region and has uniform local scale", () => {
  for (const p of [
    { lat: 35.16, lng: 139.62 },
    { lat: 26.31, lng: 127.71 },
    { lat: 24.4, lng: 124.2 },
  ]) {
    const b = M.bounds([
        p.lng - 0.13,
        p.lat - 0.11,
        p.lng + 0.13,
        p.lat + 0.11,
      ]),
      v = M.project(p, b),
      r = M.unproject(v, b);
    assert.ok(Math.abs(r.lat - p.lat) < 1e-9);
    assert.ok(Math.abs(r.lng - p.lng) < 1e-9);
    const x = M.project({ ...p, lng: p.lng + 0.001 }, b),
      y = M.project(
        { ...p, lat: p.lat + 0.001 * Math.cos((p.lat * Math.PI) / 180) },
        b,
      );
    assert.ok(Math.abs((x.x - v.x) / (v.y - y.y) - 1) < 0.0001);
  }
});
test("fish discovery uses regional months, excludes Jet-only and keeps uncertainty last", () => {
  const rows = [
    {
      id: "a",
      name: "a",
      region: "okinawa",
      status: "verified",
      evidence: [
        { fish: "グルクン", kind: "guide", months: [7], method: "bait" },
      ],
    },
    { id: "b", name: "b", region: "okinawa", status: "excluded", evidence: [] },
    {
      id: "c",
      name: "c",
      region: "kanto",
      status: "unconfirmed",
      evidence: [],
    },
  ];
  assert.equal(
    M.destinations(rows, {
      region: "okinawa",
      fish: "グルクン",
      month: 7,
      method: "bait",
    }).length,
    1,
  );
  assert.equal(
    M.destinations(rows, { fish: "グルクン", month: 1, method: "all" }).length,
    0,
  );
  assert.equal(
    M.destinations(rows, {
      region: "okinawa",
      fish: "グルクン",
      month: 7,
      method: "lure",
    }).length,
    0,
  );
});
test("screen-space clusters group close bases without hiding their identities", () => {
  const rows = [
    { id: "a", x: 0 },
    { id: "b", x: 10 },
    { id: "c", x: 80 },
  ];
  const c = M.clusters(rows, (r) => ({ x: r.x, y: 0 }), 45);
  assert.equal(c.length, 2);
  assert.deepEqual(
    c[0].rows.map((r) => r.id),
    ["a", "b"],
  );
});
test("storage transaction restores all previous keys after quota failure", () => {
  const values = new Map([
    ["points", "old"],
    ["catches", "oldC"],
  ]);
  let fail = true;
  const storage = {
    getItem: (k) => values.get(k) || null,
    removeItem: (k) => values.delete(k),
    setItem: (k, v) => {
      if (k === "catches" && v === "newC" && fail) {
        fail = false;
        throw Error("quota");
      }
      values.set(k, v);
    },
  };
  assert.throws(() =>
    M.storageTransaction(storage, { points: "new", catches: "newC" }),
  );
  assert.equal(values.get("points"), "old");
  assert.equal(values.get("catches"), "oldC");
});
test("workspace validation rejects malformed camera/favourite/draft values", () => {
  assert.ok(M.validWorkspace(M.defaultWorkspace()));
  assert.ok(!M.validWorkspace({ view: [0, 0, 0, 1] }));
  assert.ok(!M.validWorkspace({ favs: [1] }));
  assert.ok(!M.validWorkspace({ fields: { memo: {} } }));
});
test("nearby forecasts cannot cross coverage or sea basins", () => {
  const areas = [
    {
      lat: 26.3,
      lng: 127.7,
      basin: "west",
      coverage: [127.6, 26.2, 127.77, 26.4],
    },
  ];
  assert.equal(T.nearby({ lat: 26.3, lng: 127.8 }, areas), null);
  assert.equal(T.nearby({ lat: 26.3, lng: 127.7, basin: "east" }, areas), null);
  assert.ok(T.nearby({ lat: 26.3, lng: 127.71 }, areas));
});
test("marina registry audits all 34 bases with evidence and excludes current Jet fleets", () => {
  const r = require("../data/marinas.json").marinas;
  assert.equal(r.length, 34);
  assert.equal(r.filter((m) => m.region === "okinawa").length, 4);
  for (const m of r) {
    assert.ok(M.validId(m.id));
    assert.ok(m.source.startsWith("https://"));
    assert.ok(Number.isFinite(m.lat));
    if (m.status === "verified") {
      assert.ok(m.proof);
      assert.ok(m.boats.length);
    }
    if (m.status !== "excluded") assert.ok(m.tideStation);
  }
  assert.equal(r.find((m) => m.id === "J47-0050").status, "excluded");
  assert.equal(r.find((m) => m.id === "J12-0030").status, "excluded");
});
test("complete offline manifest contains every supported base and only existing public files", () => {
  const fs = require("node:fs"),
    r = require("../data/marinas.json").marinas,
    assets = require("../data/offline-packs.json").assets;
  assert.equal(new Set(assets).size, assets.length);
  for (const p of assets) assert.ok(fs.existsSync(p), p);
  for (const m of r.filter((m) => m.status !== "excluded")) {
    assert.ok(assets.includes("data/marinas/" + m.id + ".json"));
    assert.ok(assets.includes("images/maps/" + m.id + ".jpg"));
    assert.ok(
      assets.includes("data/tide-stations/" + m.tideStation.id + ".json"),
    );
  }
});
test("selected marker placement avoids toolbar, controls and a sheet at large text", () => {
  const boxes = [
      { left: 0, right: 240, top: 0, bottom: 85 },
      { left: 280, right: 720, top: 12, bottom: 204 },
      { left: 736, right: 844, top: 0, bottom: 105 },
    ],
    p = M.freePosition(844, 216, boxes, { x: 240, y: 50 });
  assert.ok(p);
  for (const b of boxes)
    assert.ok(
      p.x + 27 <= b.left ||
        p.x - 27 >= b.right ||
        p.y + 27 <= b.top ||
        p.y - 27 >= b.bottom,
    );
});
test("quota rollback frees partial new values before restoring larger old keys", () => {
  const values = new Map([
    ["a", "x".repeat(100)],
    ["b", "x"],
  ]);
  const storage = {
    getItem: (k) => values.get(k) || null,
    removeItem: (k) => values.delete(k),
    setItem: (k, v) => {
      const n =
        [...values]
          .filter(([key]) => key !== k)
          .reduce((n, [, v]) => n + v.length, 0) + v.length;
      if (n > 150) throw Error("quota");
      values.set(k, v);
    },
  };
  assert.throws(() =>
    M.storageTransaction(storage, {
      a: "x",
      b: "x".repeat(100),
      c: "x".repeat(100),
    }),
  );
  assert.equal(values.get("a").length, 100);
  assert.equal(values.get("b").length, 1);
  assert.ok(!values.has("c"));
});
test("imported workspace state cannot contain an invalid month or non-text search", () => {
  assert.ok(!M.validWorkspace({ state: { month: 13 } }));
  assert.ok(!M.validWorkspace({ state: { q: {} } }));
  assert.ok(!M.validWorkspace({ scroll: { logView: -1 } }));
});
test("official rental guides rank ahead of newer nearby reference catches", () => {
  const row = (id, kind, date) => ({
    id,
    name: id,
    status: "verified",
    region: "kanto",
    evidence: [{ fish: "アジ", kind, date, method: "all", months: [] }],
  });
  const sorted = M.destinations(
    [
      row("nearby", "reference", "2026-10-23"),
      row("guide", "guide"),
      row("rental", "report", "2026-01-01"),
    ],
    { fish: "アジ", method: "all" },
  );
  assert.deepEqual(
    sorted.map((r) => r.id),
    ["rental", "guide", "nearby"],
  );
});
