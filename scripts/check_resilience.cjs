/* Isolated failure and service-worker upgrade checks; never touches a user's browser profile. */
const { chromium, webkit } = require(
  process.env.SEABORNIA_PLAYWRIGHT || "playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const results = [],
  out = process.env.SEABORNIA_QA_DIR || "/tmp/seabornia-browser-qa";
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "pass" });
    console.log("PASS", name);
  } catch (error) {
    results.push({ name, status: "fail", error: error.message });
    throw error;
  }
}
async function faults(engine) {
  const browser = await { chromium, webkit }[engine].launch({
      headless: true,
      ...(engine === "chromium" ? { channel: "chrome" } : {}),
    }),
    ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: "block",
    }),
    p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const nav = (tab) => p.locator(".mobileNav [data-tab=" + tab + "]").click();
  try {
    await p.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (ok, fail) =>
        fail({ code: 1 });
    });
    await p.goto("http://127.0.0.1:8765/");
    await nav("log");
    await test(
      engine + ": simulated GPS denial and timeout have actionable feedback",
      async () => {
        await p.locator("#gpsFromLog").click();
        assert.match(
          await p.locator("#positionInfo").innerText(),
          /許可されていません/,
        );
        assert.equal(await p.locator("#gpsFromLog").isDisabled(), false);
        await p.evaluate(
          () =>
            (navigator.geolocation.getCurrentPosition = (ok, fail) =>
              fail({ code: 3 })),
        );
        await p.locator("#gpsFromLog").click();
        assert.match(await p.locator("#positionInfo").innerText(), /時間切れ/);
        assert.equal(await p.locator("#gpsFromLog").isDisabled(), false);
        await p.locator("#notice button").click();
      },
    );
    await test(
      engine +
        ": storage exhaustion does not clear a form or add an unsaved record",
      async () => {
        await p.locator("#pointTitle").fill("Quota QA");
        await p.locator("#pointLat").fill("35.16");
        await p.locator("#pointLon").fill("139.60");
        await p.evaluate(() => {
          window.qaSet = Storage.prototype.setItem;
          Storage.prototype.setItem = function (k, v) {
            if (k === "seabornia-v4-points")
              throw new DOMException("full", "QuotaExceededError");
            return window.qaSet.call(this, k, v);
          };
        });
        await p.locator("#savePoint").click();
        assert.equal(await p.locator("#waypointCount").innerText(), "0件");
        assert.equal(await p.locator("#pointTitle").inputValue(), "Quota QA");
        await p.evaluate(() => (Storage.prototype.setItem = window.qaSet));
        await p.locator("#notice button").click();
        await p.locator("#savePoint").click();
        await p.locator("#notice button").click();
        await p.locator("#catchMemo").fill("preserved draft");
        await p.evaluate(() => {
          Storage.prototype.setItem = function (k, v) {
            if (k === "seabornia-v4-catches")
              throw new DOMException("full", "QuotaExceededError");
            return window.qaSet.call(this, k, v);
          };
        });
        await p
          .getByRole("button", { name: "釣果を保存", exact: true })
          .click();
        await p.waitForFunction(
          () => !document.querySelector("#catchForm [type=submit]").disabled,
        );
        assert.equal(await p.locator("#personalCatchCount").innerText(), "0件");
        assert.equal(
          await p.locator("#catchMemo").inputValue(),
          "preserved draft",
        );
        await p.evaluate(() => (Storage.prototype.setItem = window.qaSet));
        await p.locator("#notice button").click();
      },
    );
    await test(
      engine + ": failed deletion retains the saved point",
      async () => {
        await p.evaluate(() => {
          Storage.prototype.setItem = function (k, v) {
            if (k === "seabornia-v4-points")
              throw new DOMException("full", "QuotaExceededError");
            return window.qaSet.call(this, k, v);
          };
        });
        await p.locator("[data-remove-point]").click();
        await p.locator("#actionSubmit").click();
        assert.equal(await p.locator("#waypointCount").innerText(), "1件");
        await p.evaluate(() => (Storage.prototype.setItem = window.qaSet));
        await p.locator("#notice button").click();
      },
    );
    await test(
      engine + ": partial import failure restores both previous storage values",
      async () => {
        const before = await p.evaluate(() => [
          localStorage.getItem("seabornia-v4-points"),
          localStorage.getItem("seabornia-v4-catches"),
        ]);
        await p.evaluate(() => {
          let thrown = false;
          Storage.prototype.setItem = function (k, v) {
            if (k === "seabornia-v4-catches" && !thrown) {
              thrown = true;
              throw new DOMException("full", "QuotaExceededError");
            }
            return window.qaSet.call(this, k, v);
          };
        });
        await p.locator("#importJson").setInputFiles({
          name: "replace.json",
          mimeType: "application/json",
          buffer: Buffer.from(
            JSON.stringify({
              version: 4,
              waypoints: [
                { id: "replace", name: "Replacement", lat: 35.2, lng: 139.6 },
              ],
              catches: [],
            }),
          ),
        });
        await p.locator("#actionSubmit").click();
        await p.waitForFunction(() =>
          document
            .querySelector("#notice span")
            .textContent.includes("読み込みできません"),
        );
        assert.deepEqual(
          await p.evaluate(() => [
            localStorage.getItem("seabornia-v4-points"),
            localStorage.getItem("seabornia-v4-catches"),
          ]),
          before,
        );
        assert.equal(await p.locator("#waypointCount").innerText(), "1件");
        await p.evaluate(() => (Storage.prototype.setItem = window.qaSet));
        await p.locator("#notice button").click();
      },
    );
    await test(
      engine +
        ": v5 settings import rollback restores records and settings on third-write failure",
      async () => {
        const keys = [
          "seabornia-v4-points",
          "seabornia-v4-catches",
          "seabornia-trip-v1",
        ];
        const before = await p.evaluate(
          (keys) => keys.map((k) => localStorage.getItem(k)),
          keys,
        );
        await p.evaluate(() => {
          let thrown = false;
          Storage.prototype.setItem = function (k, v) {
            if (k === "seabornia-trip-v1" && !thrown) {
              thrown = true;
              throw new DOMException("full", "QuotaExceededError");
            }
            return window.qaSet.call(this, k, v);
          };
        });
        await p.locator("#importJson").setInputFiles({
          name: "v5.json",
          mimeType: "application/json",
          buffer: Buffer.from(
            JSON.stringify({
              version: 5,
              waypoints: [],
              catches: [],
              tripSettings: {
                speed: 12,
                date: "2026-10-22",
                hour: "09:00",
                area: "marina",
              },
            }),
          ),
        });
        await p.locator("#actionSubmit").click();
        await p.waitForFunction(() =>
          document
            .querySelector("#notice span")
            .textContent.includes("読み込みできません"),
        );
        assert.deepEqual(
          await p.evaluate(
            (keys) => keys.map((k) => localStorage.getItem(k)),
            keys,
          ),
          before,
        );
        await p.evaluate(() => (Storage.prototype.setItem = window.qaSet));
        await p.locator("#notice button").click();
      },
    );
    await test(
      engine +
        ": failed data refresh keeps the existing reports and current tab",
      async () => {
        await nav("latest");
        const before = await p.locator("#reportList").innerText();
        await ctx.route("**/data/latest.json*", (r) => r.abort());
        await p.locator("#refreshBtn").click();
        await p.waitForFunction(() =>
          document
            .querySelector("#notice span")
            .textContent.includes("通信できません"),
        );
        assert.equal(await p.locator("#reportList").innerText(), before);
        assert.equal(await p.locator("#latestView").isVisible(), true);
        await ctx.unroute("**/data/latest.json*");
        await p.locator("#notice button").click();
      },
    );
    await test(
      engine + ": GEBCO failure leaves usable vector map and zoom controls",
      async () => {
        await ctx.route("**/images/maps/*.jpg", (r) => r.abort());
        await ctx.route("https://wms.gebco.net/**", (r) => r.abort());
        await nav("map");
        await p.locator("#layersBtn").click();
        await p
          .getByRole("button", { name: "◉ GEBCO海底図", exact: true })
          .click();
        await p.waitForFunction(() =>
          document
            .querySelector("#mapMessage")
            .textContent.includes("読み込めません"),
        );
        await p.locator("#layersBtn").click();
        const before = await p.locator("#oceanSVG").getAttribute("viewBox");
        await p.locator("#zoomIn").click();
        assert.notEqual(
          await p.locator("#oceanSVG").getAttribute("viewBox"),
          before,
        );
        assert.equal(await p.locator("#oceanSVG").isVisible(), true);
      },
    );
    if (process.env.SEABORNIA_GEBCO_FIXTURE)
      await test(
        engine +
          ": GEBCO retries successfully with a verified image and retains zoom",
        async () => {
          await ctx.unroute("https://wms.gebco.net/**");
          await ctx.route("https://wms.gebco.net/**", (r) =>
            r.fulfill({
              path: process.env.SEABORNIA_GEBCO_FIXTURE,
              contentType: "image/jpeg",
            }),
          );
          await p.locator("#retryBathy").click();
          await p.waitForFunction(
            () => document.querySelector("#mapMessage").hidden,
          );
          assert.equal(
            await p.locator("#gebcoImageGroup").getAttribute("hidden"),
            null,
          );
          assert.equal(await p.locator("#gebcoImageGroup image").count(), 1);
          const before = await p.locator("#oceanSVG").getAttribute("viewBox");
          await p.locator("#zoomOut").click();
          assert.notEqual(
            await p.locator("#oceanSVG").getAttribute("viewBox"),
            before,
          );
        },
      );
  } finally {
    await ctx.close();
    await browser.close();
  }
}
async function upgrade(engine, legacyRef = "58cd2ec") {
  let current = false,
    unavailable = false;
  const oldHTML = execFileSync("git", ["show", legacyRef + ":index.html"]),
    oldSW = execFileSync("git", ["show", legacyRef + ":sw.js"]);
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
  };
  const server = http.createServer(async (req, res) => {
    if (unavailable) {
      req.socket.destroy();
      return;
    }
    try {
      const url = new URL(req.url, "http://localhost");
      const rel = decodeURIComponent(
        url.pathname === "/" ? "/index.html" : url.pathname,
      );
      const filename = path.resolve("." + rel);
      if (!filename.startsWith(process.cwd() + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let data;
      if (!current && rel === "/index.html") data = oldHTML;
      else if (!current && rel === "/sw.js") data = oldSW;
      else if (
        !current &&
        [
          "/app.js",
          "/styles.css",
          "/app-v8.js",
          "/styles-v8.css",
          "/app-v7.js",
          "/styles-v7.css",
          "/fish-areas.js",
          "/app-v6.js",
          "/styles-v6.css",
          "/map-gestures.js",
          "/trip-conditions.js",
          "/trip-ui.js",
        ].includes(rel) &&
        legacyRef !== "58cd2ec"
      )
        data = execFileSync("git", ["show", legacyRef + ":" + rel.slice(1)]);
      else data = await fs.readFile(filename);
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(filename)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await { chromium, webkit }[engine].launch({
      headless: true,
      ...(engine === "chromium" ? { channel: "chrome" } : {}),
    }),
    ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    p = await ctx.newPage();
  p.setDefaultTimeout(12000);
  try {
    await test(
      engine +
        ": existing " +
        (legacyRef === "58cd2ec"
          ? "v4"
          : legacyRef === "296bdef"
            ? "v5"
            : legacyRef === "d569767"
              ? "v8"
              : legacyRef === "c20b09c8"
                ? "v7"
                : "v6") +
        " worker upgrades to v8.1 without losing saved data",
      async () => {
        await p.goto(origin);
        await p.evaluate(() => navigator.serviceWorker.register("./sw.js"));
        await p.evaluate(() => navigator.serviceWorker.ready);
        await p.waitForFunction(() => !!navigator.serviceWorker.controller);
        await p.evaluate(async () => {
          localStorage.setItem("seabornia-favs-v3", '["koajiro"]');
          localStorage.setItem(
            "seabornia-v4-points",
            JSON.stringify([
              {
                id: "legacy",
                name: "Legacy point",
                lat: 35.16,
                lng: 139.6,
                precision: "GPS",
              },
            ]),
          );
          localStorage.setItem(
            "seabornia-v4-catches",
            JSON.stringify([
              {
                id: "legacy-catch",
                date: "2026-10-20",
                fish: "マダイ",
                count: "2",
                memo: "Legacy catch",
                photo: "",
              },
            ]),
          );
          await caches.open("unrelated-app");
        });
        current = true;
        await p.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          const claimed = new Promise((resolve) =>
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              resolve,
              { once: true },
            ),
          );
          await registration.update();
          await claimed;
        });
        await p.waitForFunction(async () => {
          const keys = await caches.keys();
          return (
            keys.includes("seabornia-v8.1") &&
            !keys.includes("seabornia-v4.2") &&
            !keys.includes("seabornia-v6.0")
          );
        });
        await p.reload();
        await p.locator("#layersBtn").waitFor();
        await p.locator(".mobileNav [data-tab=log]").click();
        assert.equal(await p.locator("#waypointCount").innerText(), "1件");
        assert.equal(await p.locator("#personalCatchCount").innerText(), "1件");
        assert.match(
          await p.locator("#waypointList").innerText(),
          /Legacy point/,
        );
        assert.match(await p.locator("#myCatches").innerText(), /Legacy catch/);
        assert.equal(
          await p.evaluate(() => localStorage.getItem("seabornia-favs-v3")),
          '["koajiro"]',
        );
        assert.ok(
          (await p.evaluate(() => caches.keys())).includes("unrelated-app"),
        );
      },
    );
    await test(
      engine +
        (engine === "webkit"
          ? ": installed shell and records survive unreachable-origin reload"
          : ": installed shell, new assets, reports and records reopen offline"),
      async () => {
        await p.locator(".mobileNav [data-tab=latest]").click();
        await p.waitForFunction(
          () =>
            document.querySelector("#syncLabel").textContent ===
            "履歴を確認済み",
        );
        await p.waitForFunction(() =>
          document
            .querySelector("#conditionsDataStatus")
            .textContent.includes("収集確認"),
        );
        await p.locator("#reportList [data-tide-date]").first().waitFor();
        const before = await p.locator("#reportList").innerText();
        if (engine === "chromium") await ctx.setOffline(true);
        else unavailable = true;
        await p.reload({ waitUntil: "domcontentloaded" });
        await p.locator("#layersBtn").waitFor();
        await p.locator(".mobileNav [data-tab=latest]").click();
        await p.waitForFunction(() =>
          document
            .querySelector("#conditionsDataStatus")
            .textContent.includes("保存済み"),
        );
        assert.equal(await p.locator("#reportList").innerText(), before);
        const response = await p.evaluate(async () => {
          const r = await fetch(
            "./data/latest.json?offline-check=" + Date.now(),
          );
          return { ok: r.ok, count: (await r.json()).reports.length };
        });
        assert.ok(response.ok && response.count > 10);
        await p.locator(".mobileNav [data-tab=plan]").click();
        await p.waitForFunction(() =>
          document
            .querySelector("#conditionsDataStatus")
            .textContent.includes("保存済み"),
        );
        assert.match(
          await p.locator("#forecastContent").innerText(),
          /有義波高/,
        );
        assert.equal(await p.locator("#tripTideSlider").count(), 1);
        for (const file of ["conditions", "tides", "area_depths", "fish_areas"])
          assert.equal(
            await p.evaluate(
              async (file) =>
                (
                  await (
                    await fetch("./data/" + file + ".json?offline-check=1")
                  ).json()
                ).schema_version,
              file,
            ),
            1,
          );
        await p.locator(".mobileNav [data-tab=log]").click();
        assert.equal(await p.locator("#personalCatchCount").innerText(), "1件");
      },
    );
  } finally {
    await ctx.setOffline(false);
    await ctx.close();
    await browser.close();
    await new Promise((r) => server.close(r));
  }
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  try {
    for (const engine of (
      process.env.SEABORNIA_BROWSERS || "chromium,webkit"
    ).split(",")) {
      if (!process.env.SEABORNIA_UPGRADE_ONLY) {
        await faults(engine);
        await upgrade(engine);
      }
      await upgrade(engine, "296bdef");
      await upgrade(engine, "961124b");
      await upgrade(engine, "c20b09c8");
      await upgrade(engine, "d569767");
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await fs.writeFile(
      path.join(out, "resilience.json"),
      JSON.stringify(results, null, 2),
    );
  }
})();
