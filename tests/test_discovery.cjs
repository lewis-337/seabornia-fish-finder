const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const D = require("../fish-areas.js");
const html = fs.readFileSync("index.html", "utf8");
const seed = JSON.parse(
  html.match(/<script id="seed"[^>]*>(.*?)<\/script>/s)[1],
);
const curated = JSON.parse(fs.readFileSync("data/fish_areas.json"));
const id = (name) => seed.species.find((f) => f.name === name).id;
test("species names do not match inside more specific species", () => {
  assert.deepEqual(
    D.speciesIn(
      "シロアマダイ、ツムブリ、ゴマサバ、ソウダガツオ",
      seed.species,
    ).sort(),
    ["シロアマダイ", "ツムブリ", "ゴマサバ", "ソウダガツオ"].map(id).sort(),
  );
  assert.deepEqual(
    D.speciesIn("アマダイ、シロアマダイ", seed.species).sort(),
    [id("アマダイ"), id("シロアマダイ")].sort(),
  );
});
test("unlocated and opening reports never become located catches", () => {
  const db = {
    ...seed,
    areas: seed.areas.map((a) => ({ ...a, target_fish: [] })),
    reports: [
      { fish: "マダイ", area_id: null, source_name: "諸磯港" },
      { fish: "アジ", area_id: "koajiro", kind: "opening" },
    ],
  };
  assert.deepEqual(D.associations(db), []);
});
test("reverse filtering and fish lists use the same stable associations, deduplicated", () => {
  const rows = D.associations(seed, curated);
  assert.equal(
    rows.length,
    new Set(rows.map((r) => r.fishId + ":" + r.areaId)).size,
  );
  assert.ok(rows.some((r) => r.fishId === id("アジ") && r.areaId === "kamegi"));
  for (const row of rows) {
    assert.ok(seed.areas.some((a) => a.id === row.areaId));
    assert.ok(seed.species.some((f) => f.id === row.fishId));
    assert.ok(row.evidence.length);
  }
});
test("Shogo is a labelled stage reference, not an invented adult catch", () => {
  const db = {
    ...seed,
    areas: seed.areas.map((a) => ({ ...a, target_fish: [] })),
    reports: [
      {
        fish: "ショゴ",
        area_id: "kamegi",
        kind: "past",
        source: "https://example.com",
      },
    ],
  };
  const rows = D.associations(db);
  assert.equal(rows.length, 2);
  assert.match(
    rows.find((r) => r.fishId === id("カンパチ")).evidence[0].rationale,
    /成魚の釣果ではありません/,
  );
});
test("reference depth rounding, shallow water and unknown/land/no-data", () => {
  assert.equal(D.depthLabel({ elevation_m: -72 }), "約70m");
  assert.equal(D.depthLabel({ elevation_m: -3 }), "5m未満");
  for (const value of [undefined, null, NaN, 0, 20, -32768, "-20"])
    assert.equal(D.depthLabel({ elevation_m: value }), "水深未確認");
});
test("every public area has a traceable numerical model cell", () => {
  const data = JSON.parse(fs.readFileSync("data/area_depths.json"));
  assert.equal(data.release, "GEBCO2026");
  for (const a of seed.areas) {
    const r = data.areas[a.id];
    assert.ok(r);
    assert.ok(Number.isFinite(r.elevation_m));
    assert.ok(Math.abs(r.sample_lat - a.lat) < 0.005);
    assert.ok(r.source.startsWith("https://www.gebco.net/"));
    assert.ok(r.fetched_at);
  }
});
