/* Reuse the shared fish-area resolver: nearby reports are never rental catches. */
const fs = require("node:fs"),
  D = require("../fish-areas-v10.js");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const registry = read("data/marinas.json"),
  seed = read("data/seed.json"),
  latest = read("data/latest.json"),
  links = read("data/fish_areas.json");
const db = { ...seed, ...latest, species: seed.species.concat(read("data/marina-evidence.json").species) },
  home = registry.marinas.find((m) => m.id === "J14-0170");
home.evidence = D.associations(db, links).flatMap((row) =>
  row.evidence.map((e) => ({
    marinaId: home.id,
    fish: db.species.find((f) => f.id === row.fishId).name,
    kind: e.kind === "report" ? "reference" : "candidate",
    date: e.date || undefined,
    months: e.date
      ? [+e.date.slice(5, 7)]
      : db.species.find((f) => f.id === row.fishId).months,
    method: "unknown",
    source: e.source || home.source,
    note:
      e.kind === "report"
        ? "周辺の公開釣果。レンタル艇の釣果ではなく、当日の航行可否も別途確認。"
        : "既存の探索候補。釣果や現在の航行可否の保証ではありません。",
    groundId: row.areaId,
  })),
);
fs.writeFileSync("data/marinas.json", JSON.stringify(registry) + "\n");
console.log("Seabornia source links:", home.evidence.length);
