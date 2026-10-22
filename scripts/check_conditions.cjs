/* Browser acceptance checks use disposable contexts and synthetic personal records. */
const { chromium, webkit } = require(
  process.env.SEABORNIA_PLAYWRIGHT || "playwright",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
const base = process.env.SEABORNIA_URL || "http://127.0.0.1:8765/",
  out = process.env.SEABORNIA_QA_DIR || "/tmp/seabornia-conditions-qa";
const results = [];
async function run(engine) {
  const browser = await { chromium, webkit }[engine].launch({
    headless: true,
    ...(engine === "chromium" ? { channel: "chrome" } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "ja-JP",
    serviceWorkers: "block",
    acceptDownloads: true,
  });
  const p = await context.newPage();
  p.setDefaultTimeout(8000);
  const errors = [],
    requests = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => requests.push(r.url()));
  const nav = (tab) => p.locator(".mobileNav [data-tab=" + tab + "]").click();
  const shot = (label) =>
    p.screenshot({
      path: path.join(out, `${engine}-${label}.png`),
      scale: "css",
    });
  async function check(label, fn) {
    try {
      await fn();
      results.push({ engine, label, status: "pass" });
      console.log("PASS", engine, label);
    } catch (e) {
      results.push({ engine, label, status: "fail", error: e.message });
      await shot("FAILED");
      throw e;
    }
  }
  try {
    await p.clock.install({ time: new Date("2026-10-22T03:35:00Z") });
    await p.goto(base);
    await p.waitForFunction(() =>
      document
        .querySelector("#conditionsDataStatus")
        ?.textContent.includes("収集確認"),
    );
    await check(
      "unset speed action, map conditions button and preserved five tabs",
      async () => {
        assert.equal(await p.locator(".mobileNav button").count(), 5);
        await p.locator("#oceanSVG [data-area]").first().click();
        assert.match(
          await p.locator("#selectedSheet").innerText(),
          /船速を設定/,
        );
        await p.locator("#selectedSheet [data-speed-settings]").click();
        assert.equal(await p.locator("#cruiseSpeed").inputValue(), "");
        assert.equal(await p.locator("#boatSettings").getAttribute("open"), "");
        await nav("map");
        await p.locator(".sheetClose").click();
        const r = await p.locator("#mapConditions").boundingBox();
        assert.ok(r.height >= 44);
        await p.locator("#mapConditions").click();
      },
    );
    await check(
      "save speed, midnight arrival, area and waypoint ETA; reload preferences",
      async () => {
        await p.locator("#boatSettings").evaluate((e) => (e.open = true));
        await p.locator("#cruiseSpeed").fill("0");
        await p.locator("#tripForm [type=submit]").click();
        assert.equal(
          await p.evaluate(() => localStorage.getItem("seabornia-trip-v1")),
          null,
        );
        await p.locator("#cruiseSpeed").fill("15");
        await p.locator("#departureDate").fill("2026-10-22");
        await p.locator("#departureTime").fill("23:59");
        await p.locator("#tripForm [type=submit]").click();
        assert.match(await p.locator("#tripSaveStatus").innerText(), /保存/);
        await nav("map");
        await p.locator("#oceanSVG [data-area]").last().click();
        assert.match(
          await p.locator("#selectedSheet").innerText(),
          /直線移動の目安：約\d+分/,
        );
        assert.match(await p.locator("#selectedSheet").innerText(), /10\/23/);
        await p.locator(".sheetClose").click();
        await p.locator("#areaMenuBtn").click();
        assert.match(await p.locator("#areaList").innerText(), /約\d+分/);
        await p.reload();
        await nav("plan");
        assert.equal(await p.locator("#cruiseSpeed").inputValue(), "15");
      },
    );
    await check(
      "trip date independent from catalogue month and draft retained",
      async () => {
        await p.locator("#tripDate").fill("2026-10-23");
        await p.locator("#tripDate").dispatchEvent("change");
        await p.locator("#tripHour").fill("11:00");
        await p.locator("#tripHour").dispatchEvent("change");
        await nav("species");
        await p.locator("#mobileMonth").selectOption("11");
        await nav("plan");
        assert.equal(await p.locator("#tripDate").inputValue(), "2026-10-23");
        assert.equal(await p.locator("#tripHour").inputValue(), "11:00");
        await p.locator("#tripDate").fill("2026-10-22");
        await p.locator("#tripHour").fill("12:00");
        await p.locator("#tripDate").dispatchEvent("change");
      },
    );
    await check(
      "weather units, tide curve keyboard interaction, sources and warning link",
      async () => {
        assert.match(await p.locator("#forecastContent").innerText(), /m\/s/);
        assert.match(
          await p.locator("#forecastContent").innerText(),
          /有義波高/,
        );
        assert.equal(
          await p.locator('a[href*="contents=seawarning"]').count(),
          1,
        );
        await p.locator("#tripTideSlider").focus();
        const old = await p.locator("#tripTideSlider").inputValue();
        await p.keyboard.press("ArrowRight");
        assert.notEqual(await p.locator("#tripTideSlider").inputValue(), old);
        assert.match(
          await p.locator("#tripTide").innerText(),
          /実際の潮流と異なり/,
        );
        await p.locator("#tripTide").scrollIntoViewIfNeeded();
        await shot("tide-curve");
      },
    );
    await check(
      "date-only public reports and accessible tide reference dialog",
      async () => {
        await nav("latest");
        await p.locator("#recentMode").click();
        await p.locator(".rangeBtn[data-days=all]").click();
        assert.match(
          await p.locator("#reportList .tideContext").first().innerText(),
          /釣れた時刻不明/,
        );
        await p.locator("#reportList [data-tide-date]").first().click();
        assert.match(
          await p.locator("#actionContent").innerText(),
          /釣れた時刻不明/,
        );
        assert.match(
          await p.locator("#actionContent").innerText(),
          /釣れた時間を示しません/,
        );
        await p.locator("#reportTideSlider").focus();
        await p.keyboard.press("ArrowRight");
        await p.locator("#actionSubmit").click();
      },
    );
    await check(
      "personal time, nearby forecast snapshot, no private network calls and backup v5",
      async () => {
        await nav("log");
        await p.locator("#pointTitle").fill("Synthetic private point");
        await p.locator("#pointLat").fill("35.16");
        await p.locator("#pointLon").fill("139.62");
        await p.locator("#savePoint").click();
        assert.match(
          await p.locator("#waypointList").innerText(),
          /直線移動の目安：約/,
        );
        await p.locator("[data-open-point]").click();
        await p.locator(".sheetHandle").click();
        assert.match(
          await p.locator("#selectedSheet").innerText(),
          /近隣の公開予報/,
        );
        await nav("log");
        await p.locator("#catchDate").fill("2026-10-22");
        await p.locator("#catchTime").fill("12:20");
        await p
          .locator("#catchWaypoint")
          .selectOption({ label: "Synthetic private point" });
        await p.locator("#catchMemo").fill("Synthetic timed catch");
        await p.locator("#catchForm [type=submit]").click();
        await p.waitForFunction(
          () =>
            document.querySelector("#personalCatchCount").textContent === "1件",
        );
        const records = await p.evaluate(() =>
          JSON.parse(localStorage.getItem("seabornia-v4-catches")),
        );
        assert.equal(records[0].time, "12:20");
        assert.ok(records[0].conditions.tide);
        assert.ok(records[0].conditions.forecast);
        assert.match(records[0].conditions.forecast.source, /Open-Meteo/);
        assert.equal(
          requests.filter((u) =>
            /api\.open-meteo|marine-api|api\.tide736/.test(u),
          ).length,
          0,
        );
        await p.locator("[data-snapshot]").click();
        assert.match(
          await p.locator("#actionContent").innerText(),
          /近隣の公開予報/,
        );
        await p.locator("#actionSubmit").click();
        const pending = p.waitForEvent("download");
        await p.locator("#backupBtn").click();
        const file = await pending;
        await file.saveAs(path.join(out, engine + "-backup-v5.json"));
        const obj = JSON.parse(
          await fs.readFile(path.join(out, engine + "-backup-v5.json"), "utf8"),
        );
        assert.equal(obj.version, 5);
        assert.equal(obj.tripSettings.speed, 15);
        assert.equal(obj.catches[0].time, "12:20");
        await p.reload();
        await nav("log");
        assert.match(await p.locator("#myCatches").innerText(), /12:20/);
      },
    );
    await check(
      "comparison fish/date filters, public and private groups, underlying record links",
      async () => {
        await nav("latest");
        await p.locator("#conditionsMode").click();
        assert.match(
          await p.locator("#comparisonResults").innerText(),
          /公開報告/,
        );
        assert.match(
          await p.locator("#comparisonResults").innerText(),
          /個人記録 · 1件/,
        );
        assert.equal(await p.locator("#reportList").isVisible(), false);
        await p.locator("#compareFish").selectOption({ label: "アオリイカ" });
        assert.match(
          await p.locator("#comparisonResults").innerText(),
          /個人記録 · 1件/,
        );
        await p.locator("#compareStart").fill("2026-10-22");
        await p.locator("#compareEnd").fill("2026-10-22");
        await p.locator("#compareStart").dispatchEvent("input");
        await p.locator(".comparisonSection").last().locator("summary").click();
        await p.locator("[data-personal-record]").click();
        assert.equal(await p.locator("#logView").isVisible(), true);
        await nav("latest");
        assert.equal(
          await p.locator("#compareStart").inputValue(),
          "2026-10-22",
        );
        await p.locator("#clearComparison").click();
        assert.equal(await p.locator("#compareStart").inputValue(), "");
        await shot("comparison");
      },
    );
    await check(
      "backup v5 round trip and legacy v4 import without invented catch times",
      async () => {
        await nav("log");
        const file = path.join(out, engine + "-backup-v5.json");
        await p.locator("#importJson").setInputFiles(file);
        await p.locator("#actionSubmit").click();
        assert.match(await p.locator("#myCatches").innerText(), /12:20/);
        const obj = JSON.parse(await fs.readFile(file, "utf8"));
        obj.version = 4;
        delete obj.tripSettings;
        delete obj.catches[0].time;
        delete obj.catches[0].conditions;
        await p.locator("#importJson").setInputFiles({
          name: "legacy.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(obj)),
        });
        await p.locator("#actionSubmit").click();
        assert.match(
          await p.locator("#myCatches").innerText(),
          /釣れた時刻不明/,
        );
        assert.equal(
          await p.evaluate(
            () =>
              JSON.parse(localStorage.getItem("seabornia-v4-catches"))[0].time,
          ),
          undefined,
        );
      },
    );
    await check("foreground return reminder and countdown", async () => {
      await nav("plan");
      await p.locator("#boatSettings").evaluate((e) => (e.open = true));
      await p.locator("#returnDate").fill("2026-10-22");
      await p.locator("#returnTime").fill("12:45");
      await p.locator("#tripForm [type=submit]").click();
      assert.match(await p.locator("#returnCountdown").innerText(), /10分/);
      assert.match(await p.locator("#notice").innerText(), /15分以内/);
      assert.match(
        await p.locator("#returnDetails").innerText(),
        /開いている間のみ/,
      );
    });
    await check(
      "missing historical conditions and no replacement with current forecast",
      async () => {
        await p.locator("#tripDate").fill("2020-01-01");
        await p.locator("#tripDate").dispatchEvent("change");
        assert.match(
          await p.locator("#forecastContent").innerText(),
          /指定日時の予報なし/,
        );
        assert.match(
          await p.locator("#tripTide").innerText(),
          /この日の潮汐データはありません/,
        );
      },
    );
    await check(
      "iPhone native field boundaries at 320–430px, landscape and 200% text",
      async () => {
        if (await p.locator("#notice").isVisible())
          await p.locator("#notice button").click();
        for (const [width, height] of [
          [320, 740],
          [375, 667],
          [390, 844],
          [430, 932],
          [844, 390],
        ]) {
          await p.setViewportSize({ width, height });
          await nav("log");
          for (const scale of [1, 2]) {
            await p.evaluate(
              (scale) =>
                (document.documentElement.style.fontSize = 16 * scale + "px"),
              scale,
            );
            for (const id of ["catchDate", "catchTime"]) {
              await p.locator("#" + id).scrollIntoViewIfNeeded();
              const bounds = await p.locator("#" + id).evaluate((el) => {
                const a = el.getBoundingClientRect(),
                  b = el.parentElement.getBoundingClientRect(),
                  f = el.closest("form").getBoundingClientRect();
                return {
                  left: a.left,
                  right: a.right,
                  width: a.width,
                  pl: b.left,
                  pr: b.right,
                  fl: f.left,
                  fr: f.right,
                };
              });
              if (width === 320 || width === 430)
                await p
                  .locator("#" + id)
                  .locator("..")
                  .screenshot({
                    path: path.join(
                      out,
                      `${engine}-${id}-${width}-${scale}x.png`,
                    ),
                    scale: "css",
                  });
              assert.ok(
                bounds.left >= bounds.pl - 1 &&
                  bounds.right <= bounds.pr + 1 &&
                  bounds.left >= bounds.fl &&
                  bounds.right <= bounds.fr,
                JSON.stringify(bounds),
              );
            }
            await shot(`record-${width}-${scale}x`);
            await nav("plan");
            await p.locator("#boatSettings").evaluate((el) => (el.open = true));
            for (const id of [
              "tripDate",
              "tripHour",
              "departureDate",
              "departureTime",
              "returnDate",
              "returnTime",
            ]) {
              await p.locator("#" + id).scrollIntoViewIfNeeded();
              assert.equal(
                await p.locator("#" + id).evaluate((el) => {
                  const a = el.getBoundingClientRect(),
                    b = el.parentElement.getBoundingClientRect();
                  return (
                    a.width > 44 &&
                    a.left >= b.left - 1 &&
                    a.right <= b.right + 1
                  );
                }),
                true,
                id,
              );
            }
            await shot(`trip-${width}-${scale}x`);
            await nav("map");
            if (await p.locator(".sheetClose").isVisible())
              await p.locator(".sheetClose").click();
            const toolbar = await p.locator("#mapConditions").evaluate((el) => {
              const a = el.getBoundingClientRect(),
                b = document
                  .querySelector("#areaMenuBtn")
                  .getBoundingClientRect(),
                c = document
                  .querySelector("#layersBtn")
                  .getBoundingClientRect(),
                d = document.querySelector("#zoomIn").getBoundingClientRect();
              return {
                top: a.top,
                bottom: Math.max(b.bottom, c.bottom),
                right: a.right,
                zoomLeft: d.left,
              };
            });
            assert.ok(
              toolbar.top >= toolbar.bottom && toolbar.right < toolbar.zoomLeft,
              JSON.stringify(toolbar),
            );
            await shot(`map-${width}-${scale}x`);
            await nav("log");
          }
          await p.evaluate(
            () => (document.documentElement.style.fontSize = "16px"),
          );
        }
      },
    );
    await check(
      "failed refresh keeps last successful values; delayed and expired datasets labelled",
      async () => {
        await p.setViewportSize({ width: 390, height: 844 });
        await nav("plan");
        await p.locator("#tripDate").fill("2026-10-22");
        await p.locator("#tripDate").dispatchEvent("change");
        const before = await p.locator("#forecastContent").innerText();
        await p.route("**/data/conditions.json?*", (r) => r.abort());
        await p.route("**/data/tides.json?*", (r) => r.abort());
        await p.locator("#conditionsRefresh").click();
        await p.waitForFunction(() =>
          document.querySelector("#notice").textContent.includes("通信に失敗"),
        );
        assert.equal(await p.locator("#forecastContent").innerText(), before);
        await p.unroute("**/data/conditions.json?*");
        await p.unroute("**/data/tides.json?*");
        const fixture = JSON.parse(
          await fs.readFile("data/conditions.json", "utf8"),
        );
        for (const a of Object.values(fixture.areas)) {
          a.weather.fetchedAt = "2026-10-20T00:00:00+09:00";
          a.marine.fetchedAt = "2026-10-20T00:00:00+09:00";
        }
        await p.route("**/data/conditions.json?*", (r) =>
          r.fulfill({ json: fixture }),
        );
        await p.locator("#conditionsRefresh").click();
        await p.waitForFunction(() =>
          document
            .querySelector("#forecastContent")
            .textContent.includes("更新遅延"),
        );
        await shot("delayed");
        for (const a of Object.values(fixture.areas)) {
          a.weather.hours = a.weather.hours.filter(
            (h) => h.time <= "2026-10-22T12:00",
          );
          a.marine.hours = a.marine.hours.filter(
            (h) => h.time <= "2026-10-22T12:00",
          );
        }
        await p.clock.fastForward(7200000);
        await p.locator("#conditionsRefresh").click();
        await p.waitForFunction(() =>
          document
            .querySelector("#forecastContent")
            .textContent.includes("予報期限切れ"),
        );
      },
    );
    await check("no uncaught script errors", async () =>
      assert.deepEqual(errors, []),
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  try {
    for (const name of (process.env.BROWSERS || "chromium,webkit").split(","))
      await run(name);
  } finally {
    await fs.writeFile(
      path.join(out, "conditions-results.json"),
      JSON.stringify(results, null, 2),
    );
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
