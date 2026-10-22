/* v7 acceptance: actual element boundaries, not just page-overflow assertions. */
const { chromium, webkit } = require(
  process.env.SEABORNIA_PLAYWRIGHT || "playwright",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
const base = process.env.SEABORNIA_URL || "http://127.0.0.1:8765/",
  out = process.env.SEABORNIA_QA_DIR || "/tmp/seabornia-v7-discovery";
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
    }),
    p = await context.newPage(),
    errors = [];
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => errors.push(e.message));
  const nav = (tab) => p.locator(".nav[data-tab=" + tab + "]:visible").click();
  const shot = (name) =>
    p.screenshot({
      path: path.join(out, engine + "-" + name + ".png"),
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
  async function overlaps(selectors) {
    return p.evaluate((ss) => {
      const visible = ss
        .map((s) => [s, document.querySelector(s)])
        .filter(([s, e]) => e && e.getClientRects().length)
        .map(([s, e]) => ({ s, r: e.getBoundingClientRect() }));
      const bad = [];
      for (let i = 0; i < visible.length; i++)
        for (let j = i + 1; j < visible.length; j++) {
          const a = visible[i],
            b = visible[j];
          if (
            Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 1 &&
            Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 1
          )
            bad.push([a.s, b.s]);
        }
      return bad;
    }, selectors);
  }
  const controls = [
    "#areaMenuBtn",
    "#layersBtn",
    "#zoomIn",
    "#zoomOut",
    "#zoomHome",
    "#locateBtn",
    "#mapConditions",
    ".mapAdd",
    ".mapFoot",
  ];
  try {
    await p.goto(base);
    await p.waitForFunction(() =>
      document.querySelector("#areaList")?.textContent.includes("約70m"),
    );
    await check(
      "all 10 areas show traceable depth in list and sheet",
      async () => {
        await p.locator("#areaMenuBtn").click();
        assert.equal(await p.locator("[data-area-open]").count(), 10);
        await shot("area-list");
        await p.locator("[data-area-open=kamegi]").click();
        assert.match(await p.locator("[data-area-depth]").innerText(), /約70m/);
        await p.locator("[data-area-depth] summary").click();
        assert.match(
          await p.locator("[data-area-depth]").innerText(),
          /格子中心/,
        );
        await shot("depth-sheet");
        await p.locator(".sheetClose").click();
        await p.locator("#zoomHome").click();
      },
    );
    await check(
      "fish detail lists sourced areas; map action opens the same area",
      async () => {
        await nav("species");
        await p.locator('.fishCard[data-id="12"]').click();
        assert.match(await p.locator("#fishAreas").innerText(), /亀城根沖/);
        assert.match(await p.locator("#fishAreas").innerText(), /約70m/);
        await p
          .locator("#fishAreas details")
          .first()
          .evaluate((e) => (e.open = true));
        assert.ok(
          (
            await p.locator("#fishAreas a").first().getAttribute("href")
          ).startsWith("https://www.sunnyside.co.jp/"),
        );
        await shot("fish-area-list");
        await p.locator("[data-fish-area=kamegi]").click();
        assert.match(await p.locator("#selectedSheet h3").innerText(), /亀城/);
        await p.locator("#areaFish").click();
        assert.equal(await p.locator("#speciesArea").inputValue(), "kamegi");
        assert.ok(await p.locator('.fishCard[data-id="12"]').count());
      },
    );
    await check(
      "map picker cancellation restores camera, sheet, filters and draft",
      async () => {
        await p.locator("#clearAreaFilter").click();
        await p.locator("#speciesSearch").fill("アオリ");
        await p.locator("#squidOnly").click();
        await nav("log");
        await p.locator("#catchMemo").fill("保存前の下書き");
        await nav("map");
        const before = await p.locator("#oceanSVG").getAttribute("viewBox"),
          sheet = await p.locator("#selectedSheet h3").innerText();
        await nav("species");
        await p.locator("#pickSpeciesArea").click();
        assert.equal(await p.locator("#areaPicker").isVisible(), true);
        assert.equal(await p.locator("#markMapBtn").isVisible(), false);
        await p.locator("#zoomIn").click();
        await p.locator("#areaMenuBtn").click();
        await p.locator("[data-area-open=akiya]").click();
        assert.match(await p.locator("#pickerPreview").innerText(), /秋谷/);
        await p.locator("#pickerCancel").click();
        assert.equal(await p.locator("#speciesArea").inputValue(), "");
        assert.equal(await p.locator("#speciesSearch").inputValue(), "アオリ");
        assert.equal(
          await p.locator("#squidOnly").getAttribute("aria-pressed"),
          "true",
        );
        await nav("log");
        assert.equal(
          await p.locator("#catchMemo").inputValue(),
          "保存前の下書き",
        );
        await nav("map");
        assert.equal(await p.locator("#selectedSheet h3").innerText(), sheet);
        assert.equal(
          await p.locator("#oceanSVG").getAttribute("viewBox"),
          before,
        );
      },
    );
    await check(
      "map picker confirms stable area and preserves other filters",
      async () => {
        await nav("species");
        await p.locator("#pickSpeciesArea").click();
        await p.locator("#zoomHome").click();
        await p.locator("[data-area=kamegi]").click();
        await shot("picker-preview");
        await p.locator("#pickerConfirm").click();
        assert.equal(await p.locator("#speciesArea").inputValue(), "kamegi");
        assert.equal(await p.locator("#speciesSearch").inputValue(), "アオリ");
        assert.equal(
          await p.locator("#squidOnly").getAttribute("aria-pressed"),
          "true",
        );
        assert.equal(await p.locator("#fishGrid .fishCard").count(), 1);
        await p.locator("#clearAreaFilter").click();
        await p.locator("#speciesSearch").fill("");
        await p.locator("#squidOnly").click();
        await p.locator("#speciesArea").selectOption("sajima");
        assert.equal(await p.locator("#speciesArea").inputValue(), "sajima");
        await p.locator("#clearAreaFilter").click();
        await p.locator('.fishCard[data-id="29"]').click();
        assert.match(await p.locator("#fishAreas").innerText(), /海域未確認/);
        assert.equal(await p.locator("[data-fish-area]").count(), 0);
        await p.locator("#modalClose").click();
      },
    );
    await check(
      "portrait, landscape, tablet, desktop and 200% text have no control intersections",
      async () => {
        for (const [width, height] of [
          [320, 844],
          [375, 812],
          [390, 844],
          [430, 932],
          [844, 390],
          [768, 1024],
          [1280, 900],
        ])
          for (const scale of [1, 2]) {
            await p.setViewportSize({ width, height });
            await p.evaluate(
              (n) => (document.documentElement.style.fontSize = 16 * n + "px"),
              scale,
            );
            await nav("map");
            if (await p.locator(".sheetClose").isVisible())
              await p.locator(".sheetClose").click();
            await p.locator("#zoomHome").click();
            assert.deepEqual(
              await overlaps(controls),
              [],
              `${width}x${height}@${scale} map controls`,
            );
            if (width === 320 || height === 390)
              await shot(`map-${width}-${height}-${scale}x`);
            // Use the list when a deliberate previous zoom would put a marker outside the view.
            await p.locator("#areaMenuBtn").click();
            await p.locator("[data-area-open=kamegi]").click();
            assert.deepEqual(
              await overlaps([
                "#selectedSheet",
                ...controls.filter(
                  (s) => ![".mapAdd", ".mapFoot", "#mapConditions"].includes(s),
                ),
              ]),
              [],
              `${width}x${height}@${scale} sheet`,
            );
            if (width === 320 || height === 390)
              await shot(`sheet-${width}-${height}-${scale}x`);
            await p.locator(".sheetHandle").click();
            await p.waitForTimeout(50);
            assert.deepEqual(
              await overlaps([
                "#selectedSheet",
                ...controls.filter(
                  (s) => ![".mapAdd", ".mapFoot", "#mapConditions"].includes(s),
                ),
              ]),
              [],
              `${width}@${scale} expanded sheet`,
            );
            const marker = await p.locator("[data-area=kamegi]").boundingBox(),
              sheet = await p.locator("#selectedSheet").boundingBox();
            const map = await p.locator("#oceanSVG").boundingBox();
            assert.ok(
              marker.x >= map.x &&
                marker.y >= map.y &&
                marker.x + marker.width <= map.x + map.width + 1 &&
                marker.y + marker.height <= map.y + map.height + 1,
              `${width}@${scale} selected marker in viewport`,
            );
            assert.ok(
              marker.x + marker.width <= sheet.x ||
                marker.x >= sheet.x + sheet.width ||
                marker.y + marker.height <= sheet.y,
              `${width}@${scale} selected marker outside sheet`,
            );
            await p
              .locator("#selectedSheet")
              .evaluate((e) => (e.scrollTop = e.scrollHeight));
            await p.locator(".sheetClose").click();
            await nav("species");
            await p.locator("#pickSpeciesArea").click();
            await p.locator("#areaMenuBtn").click();
            await p.locator("[data-area-open=kamegi]").click();
            await p.waitForTimeout(50);
            assert.deepEqual(
              await overlaps([
                "#areaPicker",
                "#areaMenuBtn",
                "#zoomIn",
                "#zoomOut",
                "#zoomHome",
                "#locateBtn",
                "[data-area=kamegi]",
              ]),
              [],
              `${width}@${scale} picker and selected marker`,
            );
            if (width === 320 || height === 390)
              await shot(`picker-${width}-${height}-${scale}x`);
            await p.locator("#pickerCancel").click();
            await nav("log");
            for (const id of ["catchDate", "catchTime"]) {
              await p.locator("#" + id).scrollIntoViewIfNeeded();
              assert.equal(
                await p.locator("#" + id).evaluate((e) => {
                  const a = e.getBoundingClientRect(),
                    b = e.parentElement.getBoundingClientRect();
                  return (
                    a.width >= 44 &&
                    a.left >= b.left - 1 &&
                    a.right <= b.right + 1 &&
                    e.scrollWidth <= e.clientWidth + 2
                  );
                }),
                true,
                `${id} ${width}@${scale}`,
              );
              if (width === 320)
                await p
                  .locator("#" + id)
                  .locator("..")
                  .screenshot({
                    path: path.join(out, `${engine}-${id}-${scale}x.png`),
                  });
            }
            await nav("plan");
            await p.locator("#boatSettings").evaluate((e) => (e.open = true));
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
                await p.locator("#" + id).evaluate((e) => {
                  const a = e.getBoundingClientRect(),
                    b = e.parentElement.getBoundingClientRect();
                  return (
                    a.left >= b.left - 1 &&
                    a.right <= b.right + 1 &&
                    e.scrollWidth <= e.clientWidth + 2
                  );
                }),
                true,
                `${id} ${width}@${scale}`,
              );
            }
          }
        await p.evaluate(
          () => (document.documentElement.style.fontSize = "16px"),
        );
        await p.setViewportSize({ width: 390, height: 844 });
      },
    );
    await check(
      "keyboard-sized viewport keeps memo, date/time and save action reachable",
      async () => {
        await p.setViewportSize({ width: 390, height: 420 });
        await nav("log");
        for (const id of ["catchDate", "catchTime", "catchMemo"]) {
          await p.locator("#" + id).focus();
          await p.locator("#" + id).scrollIntoViewIfNeeded();
          const r = await p.locator("#" + id).boundingBox();
          assert.ok(r.y >= 0 && r.y + r.height <= 420, id);
        }
        await p.locator("#catchForm [type=submit]").scrollIntoViewIfNeeded();
        const r = await p.locator("#catchForm [type=submit]").boundingBox();
        assert.ok(r.y >= 0 && r.y + r.height <= 420);
        await shot("keyboard-sized-record");
        await p.setViewportSize({ width: 390, height: 844 });
      },
    );
    await check(
      "new icon assets decode and maskable central artwork fits safe circle",
      async () => {
        const data = await p.evaluate(async () => {
          const m = await (await fetch("./manifest.webmanifest")).json();
          const rows = [];
          for (const x of m.icons) {
            const im = new Image();
            im.src = x.src;
            await im.decode();
            rows.push([im.naturalWidth, im.naturalHeight, x.purpose]);
          }
          return rows;
        });
        assert.deepEqual(data, [
          [192, 192, "any"],
          [512, 512, "any"],
          [512, 512, "maskable"],
        ]);
        assert.match(
          await p.locator("link[rel=apple-touch-icon]").getAttribute("href"),
          /compass-v7-180/,
        );
      },
    );
    await check(
      "missing reference files preserve usable seed guide and unknown depth",
      async () => {
        await p.route("**/data/area_depths.json", (r) => r.abort());
        await p.route("**/data/fish_areas.json", (r) => r.abort());
        await p.reload();
        await p.locator("#areaMenuBtn").click();
        await p.locator("[data-area-open=kamegi]").click();
        assert.match(
          await p.locator("[data-area-depth]").innerText(),
          /水深未確認/,
        );
        await p.locator("#areaFish").click();
        assert.ok(await p.locator("#fishGrid .fishCard").count());
        await p.unroute("**/data/area_depths.json");
        await p.unroute("**/data/fish_areas.json");
      },
    );
    await check(
      "no uncaught errors during discovery, layout and form checks",
      async () => assert.deepEqual(errors, []),
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  try {
    for (const e of (process.env.SEABORNIA_BROWSERS || "chromium,webkit").split(
      ",",
    ))
      await run(e);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await fs.writeFile(
      path.join(out, "discovery-results.json"),
      JSON.stringify(results, null, 2),
    );
  }
})();
