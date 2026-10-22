/* Pure trip calculations. Times are explicit Asia/Tokyo, never device-local. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SeaborniaTrip = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  function epoch(date, time = "00:00") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !TIME.test(time || ""))
      return NaN;
    const n = Date.parse(date + "T" + time + ":00+09:00");
    return Number.isFinite(n) && jstDate(n) === date ? n : NaN;
  }
  function jstDate(n = Date.now()) {
    return new Date(n + 32400000).toISOString().slice(0, 10);
  }
  function jstTime(n) {
    return new Date(n + 32400000).toISOString().slice(11, 16);
  }
  function speed(value) {
    if (value === null || value === "" || typeof value === "boolean")
      return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 && n <= 60 ? n : null;
  }
  function eta(km, knots, departure) {
    const s = speed(knots);
    if (s === null || !Number.isFinite(km) || km < 0) return null;
    const minutes = Math.ceil(((km / 1.852 / s) * 60) / 5) * 5;
    const start = typeof departure === "number" ? departure : NaN;
    return {
      minutes,
      arrival: Number.isFinite(start) ? start + minutes * 60000 : null,
    };
  }
  function distance(a, b) {
    const r = Math.PI / 180,
      x =
        Math.sin(((a.lat - b.lat) * r) / 2) ** 2 +
        Math.cos(a.lat * r) *
          Math.cos(b.lat * r) *
          Math.sin(((a.lng - b.lng) * r) / 2) ** 2;
    return 12742 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function nearby(point, areas) {
    if (
      !point ||
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lng) ||
      point.lat < 35.07 ||
      point.lat > 35.29 ||
      point.lng < 139.51 ||
      point.lng > 139.72
    )
      return null;
    return (
      [...areas].sort((a, b) => distance(point, a) - distance(point, b))[0] ||
      null
    );
  }
  function events(data) {
    return Object.values(data?.days || {})
      .flatMap((d) => d.events || [])
      .filter((e) => Number.isFinite(e.at))
      .sort((a, b) => a.at - b.at);
  }
  function tideAt(data, date, time) {
    const day = data?.days?.[date];
    if (!day) return null;
    const at = TIME.test(time || "") ? epoch(date, time) : NaN,
      all = events(data);
    if (!Number.isFinite(at))
      return { name: day.name, phase: null, next: null, height: null };
    const before = all.filter((e) => e.at <= at).at(-1),
      next = all.find((e) => e.at > at);
    let phase = null;
    if (before && next && next.at - before.at < 18 * 3600000)
      phase = next.kind === "high" ? "上げ潮（推算）" : "下げ潮（推算）";
    const close = all.find((e) => Math.abs(e.at - at) <= 10 * 60000);
    if (close)
      phase = close.kind === "high" ? "満潮前後（推算）" : "干潮前後（推算）";
    const samples = day.curve || [],
      lo = samples.filter((p) => p.at <= at).at(-1),
      hi = samples.find((p) => p.at >= at);
    const height =
      lo && hi
        ? hi.at === lo.at
          ? lo.cm
          : lo.cm + ((hi.cm - lo.cm) * (at - lo.at)) / (hi.at - lo.at)
        : null;
    return {
      name: day.name,
      phase,
      next: next || null,
      height,
      nextHigh: all.find((e) => e.at > at && e.kind === "high") || null,
      nextLow: all.find((e) => e.at > at && e.kind === "low") || null,
    };
  }
  function forecast(area, date, time, now = Date.now()) {
    const at = epoch(date, time);
    if (!area || !Number.isFinite(at)) return null;
    const hour = date + "T" + time.slice(0, 2) + ":00";
    const weather = area.weather?.hours?.find((h) => h.time === hour) || null;
    const marine = area.marine?.hours?.find((h) => h.time === hour) || null;
    function status(part, row) {
      if (!row) return "unavailable";
      const hours = part.hours || [],
        end = hours.at(-1)?.time;
      if (!end || now > Date.parse(end + "+09:00") + 3600000) return "expired";
      return !part.fetchedAt || now - Date.parse(part.fetchedAt) > 3 * 3600000
        ? "delayed"
        : "current";
    }
    return {
      at,
      weather,
      marine,
      weatherStatus: status(area.weather, weather),
      marineStatus: status(area.marine, marine),
      daylight: area.weather?.days?.find((d) => d.date === date) || null,
    };
  }
  function snapshot(conditions, tides, point, date, time, now = Date.now()) {
    if (!TIME.test(time || "")) return null;
    const tide = tideAt(tides, date, time);
    const selected = nearby(point, Object.values(conditions?.areas || {}));
    const f = forecast(selected, date, time, now);
    // Never attach a present forecast to a past hour, or a delayed forecast as current.
    const weather =
      f?.weatherStatus === "current" && f.at >= now - 3600000
        ? f.weather
        : null;
    const marine =
      f?.marineStatus === "current" && f.at >= now - 3600000 ? f.marine : null;
    return {
      version: 1,
      capturedAt: new Date(now).toISOString(),
      tide:
        tide && selected
          ? {
              ...tide,
              source: "tide736",
              station: "油壺・推算（地域参考）",
              fetchedAt: tides.days[date].fetchedAt,
            }
          : null,
      forecast:
        weather || marine
          ? {
              area: selected.name,
              nearby: true,
              weather,
              marine,
              source: "Open-Meteo",
              weatherFetchedAt: weather ? selected.weather.fetchedAt : null,
              marineFetchedAt: marine ? selected.marine.fetchedAt : null,
              validAt: new Date(f.at).toISOString(),
            }
          : null,
    };
  }
  function reminder(returnAt, now = Date.now()) {
    if (!Number.isFinite(returnAt)) return null;
    const minutes = Math.ceil((returnAt - now) / 60000);
    return {
      minutes,
      due: minutes <= 15 && minutes >= 0,
      overdue: minutes < 0,
    };
  }
  function wind(degrees) {
    return Number.isFinite(degrees)
      ? [
          "北",
          "北北東",
          "北東",
          "東北東",
          "東",
          "東南東",
          "南東",
          "南南東",
          "南",
          "南南西",
          "南西",
          "西南西",
          "西",
          "西北西",
          "北西",
          "北北西",
        ][Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16] + "から"
      : "不明";
  }
  return {
    epoch,
    jstDate,
    jstTime,
    speed,
    eta,
    distance,
    nearby,
    tideAt,
    forecast,
    snapshot,
    reminder,
    wind,
    validTime: (t) => TIME.test(t || ""),
  };
});
