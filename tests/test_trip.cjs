const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../trip-conditions.js");
const date = "2026-10-22",
  at = (t) => T.epoch(date, t);
const event = (d, t, kind, cm) => ({ at: T.epoch(d, t), kind, cm });
const tides = {
  days: {
    "2026-10-21": {
      name: "中潮",
      events: [event("2026-10-21", "22:00", "low", 40)],
      curve: [],
    },
    [date]: {
      name: "中潮",
      fetchedAt: "2026-10-21T01:00:00+09:00",
      events: [
        event(date, "04:00", "high", 130),
        event(date, "10:00", "low", 40),
        event(date, "16:00", "high", 140),
        event(date, "22:00", "low", 50),
      ],
      curve: [
        { at: at("00:00"), cm: 70 },
        { at: at("12:00"), cm: 60 },
        { at: T.epoch("2026-10-23"), cm: 80 },
      ],
    },
    "2026-10-23": {
      name: "中潮",
      events: [event("2026-10-23", "04:00", "high", 140)],
      curve: [],
    },
  },
};
test("knots unset and invalid are never zero/division estimates", () => {
  for (const v of [null, "", 0, -1, 61, NaN, Infinity, "bad", true])
    assert.equal(T.eta(5, v), null);
  assert.equal(T.speed("15.5"), 15.5);
});
test("nautical mile ETA rounds up to five minutes and responds to speed", () => {
  assert.equal(T.eta(1.852, 12).minutes, 5);
  assert.equal(T.eta(1.852 * 1.01, 12).minutes, 10);
  assert.equal(T.eta(18.52, 10).minutes, 60);
  assert.equal(T.eta(18.52, 20).minutes, 30);
  assert.equal(T.eta(0, 10).minutes, 0);
});
test("arrival crosses midnight in JST independently of host timezone", () => {
  const r = T.eta(18.52, 10, T.epoch(date, "23:40"));
  assert.equal(T.jstDate(r.arrival), "2026-10-23");
  assert.equal(T.jstTime(r.arrival), "00:40");
  assert.ok(Number.isNaN(T.epoch("2026-02-30")));
  assert.ok(Number.isNaN(T.epoch(date, "")));
});
test("date-only public reports have tide name but no invented phase", () => {
  const r = T.tideAt(tides, date);
  assert.equal(r.name, "中潮");
  assert.equal(r.phase, null);
  assert.equal(r.height, null);
  assert.equal(T.tideAt(tides, "2020-01-01"), null);
});
test("tide phases use adjacent day events, extrema and next-day events", () => {
  assert.match(T.tideAt(tides, date, "00:30").phase, /上げ潮/);
  assert.match(T.tideAt(tides, date, "05:30").phase, /下げ潮/);
  assert.match(T.tideAt(tides, date, "10:05").phase, /干潮前後/);
  assert.equal(
    T.tideAt(tides, date, "23:40").nextHigh.at,
    T.epoch("2026-10-23", "04:00"),
  );
  assert.ok(Number.isFinite(T.tideAt(tides, date, "11:30").height));
});
const area = {
  id: "marina",
  name: "シーボニア",
  lat: 35.162333,
  lng: 139.619005,
  weather: {
    fetchedAt: new Date(at("09:00")).toISOString(),
    hours: [
      { time: date + "T10:00", wind_speed_10m: 4 },
      { time: date + "T11:00", wind_speed_10m: 5 },
    ],
    days: [],
  },
  marine: {
    fetchedAt: new Date(at("09:00")).toISOString(),
    hours: [{ time: date + "T10:00", wave_height: 0.3 }],
  },
};
test("forecast freshness separates missing, delayed and expired without substituting hours", () => {
  assert.equal(
    T.forecast(area, date, "10:30", at("10:35")).weatherStatus,
    "current",
  );
  assert.equal(
    T.forecast(
      {
        ...area,
        weather: {
          ...area.weather,
          fetchedAt: new Date(at("06:00")).toISOString(),
        },
      },
      date,
      "10:00",
      at("10:35"),
    ).weatherStatus,
    "delayed",
  );
  assert.equal(
    T.forecast(area, date, "10:00", at("13:00")).weatherStatus,
    "expired",
  );
  assert.equal(T.forecast(area, date, "12:00", at("10:30")).weather, null);
});
test("private forecast selection is local and restricted to covered region", () => {
  assert.equal(T.nearby({ lat: 35.16, lng: 139.62 }, [area]).id, "marina");
  assert.equal(T.nearby({ lat: 36, lng: 140 }, [area]), null);
  assert.equal(T.nearby(null, [area]), null);
});
test("snapshots require explicit catch time, known location and available matching forecast", () => {
  const db = { areas: { marina: area } };
  assert.equal(T.snapshot(db, tides, area, date, ""), null);
  const s = T.snapshot(db, tides, area, date, "10:20", at("10:35"));
  assert.equal(s.forecast.area, "シーボニア");
  assert.match(s.tide.phase, /干潮前後|上げ潮/);
  assert.equal(
    T.snapshot(db, tides, area, date, "10:20", at("14:00")).forecast,
    null,
  );
  assert.equal(
    T.snapshot(db, tides, { lat: 36, lng: 140 }, date, "10:20", at("10:35"))
      .forecast,
    null,
  );
  assert.equal(
    T.snapshot(db, tides, null, date, "10:20", at("10:35")).tide,
    null,
  );
});
test("foreground reminders trigger within 15 minutes including returning from suspension", () => {
  assert.equal(T.reminder(at("11:00"), at("10:44")).due, false);
  assert.equal(T.reminder(at("11:00"), at("10:45")).due, true);
  assert.equal(T.reminder(at("11:00"), at("11:01")).overdue, true);
  assert.equal(T.reminder(NaN), null);
});
test("wind direction is where the wind comes from", () => {
  assert.equal(T.wind(0), "北から");
  assert.equal(T.wind(360), "北から");
  assert.equal(T.wind(157.5), "南南東から");
  assert.equal(T.wind(null), "不明");
});
