/* Leaflet renders geographic tiles; the shared pointer controller owns gestures.
   No external tiles enter our service worker/offline packs. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SeaStyleBasemap = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const inverse = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
  function geographic(view, bounds, width) {
    const [x, y, w, h] = view, [west, south, east, north] = bounds;
    return {
      lng: west + (x + w / 2) / 1050 * (east - west),
      lat: inverse(merc(north) - (y + h / 2) / 950 * (merc(north) - merc(south))),
      zoom: Math.log2(360 * 1050 / (256 * (east - west) * (w / width))),
    };
  }
  function legacy(camera, bounds, width, height) {
    const scale = 360 * 1050 / (256 * (bounds[2] - bounds[0]) * 2 ** camera.zoom);
    const x = (camera.lng - bounds[0]) / (bounds[2] - bounds[0]) * 1050;
    const y = (merc(bounds[3]) - merc(camera.lat)) / (merc(bounds[3]) - merc(bounds[1])) * 950;
    return [x - width * scale / 2, y - height * scale / 2, width * scale, height * scale];
  }
  const validCamera = (c) => c && Number.isFinite(c.lat) && Math.abs(c.lat) < 85 && Number.isFinite(c.lng) && Math.abs(c.lng) <= 180 && Number.isFinite(c.zoom) && c.zoom >= 0 && c.zoom <= 24;
  function scaleBar(camera) {
    const metresPerPixel = 40075016.686 * Math.cos(camera.lat * Math.PI / 180) / (256 * 2 ** camera.zoom);
    const target = 80 * metresPerPixel, unit = 10 ** Math.floor(Math.log10(target));
    const metres = [5, 2, 1].map(n=>n*unit).find(n=>n<=target) || unit/2;
    return {width:metres/metresPerPixel,label:metres>=1000 ? (metres/1000)+"km" : metres+"m"};
  }
  function settings(value, oldLayer) {
    const v = value || {};
    return {
      base: ["standard", "pale", "photo", "diagram"].includes(v.base) ? v.base : "standard",
      overlays: Object.fromEntries(["spots", "points", "habitat", "depth"].map((k) => [k, typeof v.overlays?.[k] === "boolean" ? v.overlays[k] : k === "spots" || k === "points" || k === oldLayer])),
      opacity: Number.isFinite(v.opacity) ? Math.min(1, Math.max(0.15, v.opacity)) : 0.65,
    };
  }
  function create(container, onState = () => {}) {
    let map, tiles, wanted = "standard", timer, successes = 0, failures = 0, generation = 0, last;
    const fallback = (reason) => {
      clearTimeout(timer);
      container.classList.add("diagramActive");
      onState({ requested: wanted, actual: "diagram", reason });
    };
    if (typeof L === "undefined") {
      fallback("詳細地図を読み込めません。オフライン簡易図を表示します。");
      return { sync() {}, choose() {}, destroy() {} };
    }
    map = L.map(container, {
      zoomControl: false, attributionControl: false, dragging: false, touchZoom: false,
      doubleClickZoom: false, scrollWheelZoom: false, boxZoom: false, keyboard: false,
      zoomSnap: 0, zoomDelta: 0.5, minZoom: 0, maxZoom: 24,
      zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false,
    });
    function choose(base = wanted) {
      wanted = base;
      const serial = ++generation;
      clearTimeout(timer);
      if (tiles) { map.removeLayer(tiles); tiles = null; }
      successes = failures = 0;
      if (base === "diagram") { fallback("オフライン簡易図・概略位置"); return; }
      if (!navigator.onLine) { fallback("オフライン簡易図・詳細地図は通信時に表示"); return; }
      // GSI's photo coverage varies offshore. Missing imagery is never invented.
      const id = { standard: "std", pale: "pale", photo: "seamlessphoto" }[base] || "std";
      tiles = L.tileLayer(`https://cyberjapandata.gsi.go.jp/xyz/${id}/{z}/{x}/{y}.${base === "photo" ? "jpg" : "png"}`, {
        minNativeZoom: base === "photo" ? 2 : 2, maxNativeZoom: 18, maxZoom: 24,
        keepBuffer: 1, updateWhenIdle: true, updateWhenZooming: false,
        crossOrigin: true,
      });
      const current = () => serial === generation;
      // Leaflet 1.9.4 retains buffered tiles. An earlier successful viewport must
      // not hide complete coverage failure after a pan or zoom.
      const visibleSuccesses = () => Object.values(tiles?._tiles || {}).filter(t=>t.current && t.el?.complete && t.el.naturalWidth>0).length;
      tiles.on("loading", () => {
        if (!current()) return;
        clearTimeout(timer);
        successes = failures = 0;
        timer = setTimeout(() => { if (current() && !visibleSuccesses()) fallback("詳細地図の応答がありません。簡易図を表示中。再試行できます。"); }, 12000);
      });
      tiles.on("tileload", () => {
        if (!current() || !navigator.onLine) return;
        successes++;
        if (!visibleSuccesses()) return;
        container.classList.remove("diagramActive");
        clearTimeout(timer);
        onState({ requested: wanted, actual: wanted, reason: "" });
      });
      tiles.on("tileerror", () => { if (current()) failures++; });
      tiles.on("load", () => {
        if (!current()) return;
        clearTimeout(timer);
        if (!visibleSuccesses()) fallback("この範囲の詳細地図を取得できません。簡易図を表示中。再試行できます。");
        else if (failures) onState({ requested: wanted, actual: wanted, reason: "地図の一部は未取得・提供範囲外です。簡易図への切替もできます。" });
      });
      container.classList.add("diagramActive");
      onState({ requested: wanted, actual: "diagram", reason: "詳細地図を読み込み中・簡易図を表示中" });
      tiles.addTo(map);
      if (last) sync(...last);
    }
    function sync(view, width, height, bounds) {
      if (!(width > 0 && height > 0)) return;
      last = [view, width, height, bounds];
      const c = geographic(view, bounds, width);
      map.invalidateSize({ animate: false, pan: false });
      const old = map._loaded && map.getCenter();
      if (!old || Math.abs(old.lat - c.lat) > 1e-10 || Math.abs(old.lng - c.lng) > 1e-10 || Math.abs(map.getZoom() - c.zoom) > 1e-10)
        map.setView([c.lat, c.lng], c.zoom, { animate: false });
    }
    const offline = () => fallback("オフライン簡易図・詳細地図は通信時に表示");
    const online = () => choose();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return { sync, choose, destroy() { clearTimeout(timer); generation++; window.removeEventListener("offline", offline); window.removeEventListener("online", online); map.remove(); } };
  }
  return { geographic, legacy, validCamera, scaleBar, settings, create };
});
