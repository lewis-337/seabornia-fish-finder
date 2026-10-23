/* Public geography, destination evidence and private workspace invariants. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SeaStyleMarinas = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const HOME = "J14-0170",
    KEY = "seabornia-workspaces-v1";
  const owner = (r) => r?.marinaId || HOME;
  const mine = (rows, id) => rows.filter((r) => owner(r) === id);
  const merge = (all, rows, id) => [
    ...all.filter((r) => owner(r) !== id),
    ...rows.map((r) => ({ ...r, marinaId: id })),
  ];
  const validId = (id) => /^J\d{2}-\d{4}$/.test(id || "");
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  function bounds(b) {
    const x = (b[0] + b[2]) / 2,
      y = (merc(b[1]) + merc(b[3])) / 2;
    const dy = Math.max(
        merc(b[3]) - merc(b[1]),
        ((((b[2] - b[0]) * Math.PI) / 180) * 950) / 1050,
      ),
      dx = (((dy * 1050) / 950) * 180) / Math.PI;
    const lat = (v) =>
      ((2 * Math.atan(Math.exp(v)) - Math.PI / 2) * 180) / Math.PI;
    return [x - dx / 2, lat(y - dy / 2), x + dx / 2, lat(y + dy / 2)];
  }
  function project(p, b) {
    return {
      x: ((p.lng - b[0]) / (b[2] - b[0])) * 1050,
      y: ((merc(b[3]) - merc(p.lat)) / (merc(b[3]) - merc(b[1]))) * 950,
    };
  }
  function unproject(p, b) {
    return {
      lng: b[0] + (p.x / 1050) * (b[2] - b[0]),
      lat:
        ((2 *
          Math.atan(
            Math.exp(merc(b[3]) - (p.y / 950) * (merc(b[3]) - merc(b[1]))),
          ) -
          Math.PI / 2) *
          180) /
        Math.PI,
    };
  }
  function paths(geometries, b) {
    const ring = (rs) =>
      rs
        .map((p, i) => {
          const v = project({ lng: p[0], lat: p[1] }, b);
          return (i ? "L" : "M") + v.x.toFixed(2) + " " + v.y.toFixed(2);
        })
        .join("") + "Z";
    return geometries.flatMap((g) =>
      g.type === "Polygon"
        ? [g.coordinates.map(ring).join("")]
        : g.type === "MultiPolygon"
          ? g.coordinates.map((p) => p.map(ring).join(""))
          : [],
    );
  }
  function evidence(m, fish, month, method) {
    return (m.evidence || []).filter(
      (e) =>
        (!fish || e.fish === fish) &&
        (!e.months?.length || e.months.includes(+month)) &&
        (method === "all" || e.method === "all" || e.method === method),
    );
  }
  function available(m) {
    return (
      m.status !== "excluded" &&
      !["closed", "rental-suspended", "no-fleet"].includes(
        m.availability?.state,
      )
    );
  }
  function destinations(
    registry,
    {
      region = "all",
      fish = "",
      month = new Date().getMonth() + 1,
      method = "all",
      uncertain = true,
    } = {},
  ) {
    return registry
      .filter(
        (m) =>
          available(m) &&
          (uncertain || m.status === "verified") &&
          (region === "all" || m.region === region),
      )
      .map((m) => ({ ...m, matches: evidence(m, fish, month, method) }))
      .filter(
        (m) =>
          ((!fish && method === "all") || m.matches.length) &&
          !(
            method === "bait" &&
            m.boats?.length &&
            m.boats.every((b) => b.bait === "prohibited")
          ),
      )
      .sort((a, b) => {
        const rank = (m) =>
          m.status !== "verified"
            ? 5
            : m.matches.some((e) => e.kind === "report")
              ? 0
              : m.matches.some((e) => e.kind === "guide")
                ? 1
                : m.matches.some((e) => e.kind === "reference")
                  ? 2
                  : m.matches.some((e) => e.kind === "candidate")
                    ? 3
                    : 4;
        const latest = (m) =>
          m.matches
            .map((e) => e.date || "")
            .sort()
            .at(-1) || "";
        return (
          rank(a) - rank(b) ||
          latest(b).localeCompare(latest(a)) ||
          a.name.localeCompare(b.name, "ja")
        );
      });
  }
  function defaultWorkspace() {
    return { favs: [], state: {}, fields: {}, scroll: {}, trip: null };
  }
  function validWorkspace(w) {
    const s = w?.state || {};
    if (s.reportLimit !== undefined && (!Number.isInteger(s.reportLimit) || s.reportLimit < 1 || s.reportLimit > 100000)) return false;
    if (
      (s.year !== undefined &&
        (!Number.isInteger(s.year) || s.year < 2024 || s.year > 2200)) ||
      (s.month !== undefined &&
        (!Number.isInteger(s.month) || s.month < 1 || s.month > 12)) ||
      ["q", "group", "reportMode", "layer", "reportFish", "reportKind"].some(
        (k) => s[k] !== undefined && typeof s[k] !== "string",
      ) ||
      ["squid", "nov"].some(
        (k) => s[k] !== undefined && typeof s[k] !== "boolean",
      ) ||
      (s.range !== undefined &&
        s.range !== null &&
        (!Number.isFinite(s.range) || s.range < 0)) ||
      (w?.scroll &&
        Object.values(w.scroll).some((v) => !Number.isFinite(v) || v < 0))
    )
      return false;
    return (
      w &&
      typeof w === "object" &&
      !Array.isArray(w) &&
      (!w.favs ||
        (Array.isArray(w.favs) &&
          w.favs.length <= 5000 &&
          w.favs.every((x) => typeof x === "string"))) &&
      (!w.camera || (Number.isFinite(w.camera.lat) && Math.abs(w.camera.lat) < 85 && Number.isFinite(w.camera.lng) && Math.abs(w.camera.lng) <= 180 && Number.isFinite(w.camera.zoom) && w.camera.zoom >= 0 && w.camera.zoom <= 24)) &&
      (!w.map || (["standard", "pale", "photo", "diagram"].includes(w.map.base) && w.map.overlays && typeof w.map.overlays === "object" && !Array.isArray(w.map.overlays) && ["spots", "points", "habitat", "depth"].every(k => typeof w.map.overlays[k] === "boolean") && Number.isFinite(w.map.opacity) && w.map.opacity >= 0.15 && w.map.opacity <= 1)) &&
      (!w.view ||
        (Array.isArray(w.view) &&
          w.view.length === 4 &&
          w.view.every(Number.isFinite) &&
          w.view[2] > 0 &&
          w.view[3] > 0)) &&
      (!w.fields ||
        (typeof w.fields === "object" &&
          Object.values(w.fields).every(
            (x) => typeof x === "string" && x.length <= 1000000,
          )))
    );
  }
  function storageTransaction(storage, values) {
    const previous = Object.fromEntries(
      Object.keys(values).map((k) => [k, storage.getItem(k)]),
    );
    try {
      for (const [k, v] of Object.entries(values))
        v === null ? storage.removeItem(k) : storage.setItem(k, v);
    } catch (e) {
      for (const k of Object.keys(previous)) {
        try {
          storage.removeItem(k);
        } catch {}
      }
      for (const [k, v] of Object.entries(previous)) {
        try {
          v === null ? storage.removeItem(k) : storage.setItem(k, v);
        } catch {}
      }
      throw e;
    }
  }
  function backupRecords(obj, allPoints, allCatches) {
    if (obj.version === 6)
      return { points: obj.waypoints, catches: obj.catches };
    return {
      points: merge(
        allPoints,
        obj.waypoints.map((p) => ({ ...p, marinaId: HOME })),
        HOME,
      ),
      catches: merge(
        allCatches,
        obj.catches.map((p) => ({ ...p, marinaId: HOME })),
        HOME,
      ),
    };
  }
  // Screen-space clusters preserve usable markers at regional scales.
  function clusters(rows, projectPoint, radius = 46) {
    const result = [];
    for (const row of rows) {
      const p = projectPoint(row);
      let c = result.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < radius);
      if (c) c.rows.push(row);
      else result.push({ x: p.x, y: p.y, rows: [row] });
    }
    return result;
  }
  function freePosition(width, height, obstacles, preferred, radius = 27) {
    const space = typeof radius === "number" ? {left:radius,right:radius,top:radius,bottom:radius} : radius;
    let best = null,
      score = Infinity;
    for (let y = space.top; y <= height - space.bottom; y += 6)
      for (let x = space.left; x <= width - space.right; x += 6) {
        if (
          obstacles.some(
            (r) =>
              x + space.right > r.left &&
              x - space.left < r.right &&
              y + space.bottom > r.top &&
              y - space.top < r.bottom,
          )
        )
          continue;
        const d = Math.hypot(x - preferred.x, y - preferred.y);
        if (d < score) {
          score = d;
          best = { x, y };
        }
      }
    return best;
  }
  return {
    freePosition,
    HOME,
    KEY,
    bounds,
    owner,
    mine,
    merge,
    validId,
    project,
    unproject,
    paths,
    evidence,
    available,
    destinations,
    defaultWorkspace,
    validWorkspace,
    storageTransaction,
    backupRecords,
    clusters,
  };
});
