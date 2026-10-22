/* Shared, deterministic discovery rules. No port-to-catch-location inference. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SeaborniaDiscovery = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function speciesIn(text, species) {
    let rest = String(text || "");
    const found = [];
    // Consume longer names first: シロアマダイ is not アマダイ; ツムブリ is not ブリ.
    for (const f of [...species].sort(
      (a, b) => b.name.length - a.name.length,
    )) {
      if (rest.includes(f.name)) {
        found.push(f.id);
        rest = rest.split(f.name).join(" ");
      }
    }
    return found;
  }
  function associations(db, curated = {}) {
    const rows = new Map();
    const add = (fishId, areaId, evidence) => {
      if (
        !db.species.some((f) => f.id === fishId) ||
        !db.areas.some((a) => a.id === areaId)
      )
        return;
      const key = fishId + ":" + areaId;
      if (!rows.has(key)) rows.set(key, { fishId, areaId, evidence: [] });
      rows.get(key).evidence.push(evidence);
    };
    for (const a of db.areas)
      for (const name of a.target_fish || []) {
        for (const id of speciesIn(name, db.species))
          add(id, a.id, {
            kind: "candidate",
            label: "既存の海域候補",
            rationale:
              "公開済みの概略海域ガイド。個別の釣果証明ではありません。",
          });
        if (name === "カンパチ") {
          const shogo = db.species.find((f) => f.name === "ショゴ");
          if (shogo)
            add(shogo.id, a.id, {
              kind: "candidate",
              label: "成長段階からの候補",
              rationale:
                "ショゴはカンパチの若魚。ショゴの釣果を確認した意味ではありません。",
            });
        }
      }
    for (const r of db.reports || []) {
      if (!r.area_id || r.kind === "opening") continue;
      for (const id of speciesIn(r.fish, db.species)) {
        add(id, r.area_id, {
          kind: "report",
          source: r.source,
          label: r.source_name,
          date: r.date,
          depth: r.depth,
          reportId: r.id,
          rationale:
            r.fish +
            "。公開記録に海域名あり。代表位置は釣果GPSではありません。",
        });
        if (db.species.find((f) => f.id === id)?.name === "ショゴ") {
          const parent = db.species.find((f) => f.name === "カンパチ");
          if (parent)
            add(parent.id, r.area_id, {
              kind: "report",
              source: r.source,
              date: r.date,
              label: r.source_name,
              rationale:
                "ショゴ（カンパチの若魚）の記録。成魚の釣果ではありません。",
            });
        }
      }
    }
    for (const r of curated.links || [])
      if (r.source && /^https:\/\//.test(r.source))
        add(r.fish_id, r.area_id, {
          ...r,
          kind: r.kind === "report" ? "report" : "candidate",
        });
    return [...rows.values()];
  }
  function depthLabel(row) {
    const v = row?.elevation_m;
    if (typeof v !== "number" || !Number.isFinite(v) || v >= 0 || v <= -12000)
      return "水深未確認";
    return -v < 5 ? "5m未満" : "約" + Math.round(-v / 5) * 5 + "m";
  }
  return { speciesIn, associations, depthLabel };
});
