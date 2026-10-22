/* Run against a local server: SEABORNIA_PLAYWRIGHT=/path/to/playwright node scripts/check_browser.cjs */
const { chromium, webkit } = require(
  process.env.SEABORNIA_PLAYWRIGHT || "playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.SEABORNIA_URL || "http://127.0.0.1:8765/";
const out = process.env.SEABORNIA_QA_DIR || "/tmp/seabornia-browser-qa";
const results = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "pass" });
    console.log("PASS", name);
  } catch (error) {
    results.push({ name, status: "fail", error: error.message });
    console.error("FAIL", name, error.message);
    throw error;
  }
}
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
    acceptDownloads: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  const nav = (name) =>
    page
      .getByRole("navigation", { name: "メインメニュー" })
      .getByRole("button", { name })
      .click();
  const shot = (name) =>
    page.screenshot({
      path: path.join(out, engine + "-" + name + ".png"),
      scale: "css",
    });
  const check = async (label, fn) => test(engine + ": " + label, fn);
  try {
    await page.goto(base);
    await page.locator("#oceanSVG [data-area]").first().waitFor();
    await check("map layout, marker and toolbar target sizes", async () => {
      const labels = await page.locator("#spots [data-area]").count();
      assert.equal(labels, 10);
      for (const id of [
        "zoomIn",
        "zoomOut",
        "zoomHome",
        "locateBtn",
        "areaMenuBtn",
        "layersBtn",
        "markMapBtn",
      ]) {
        const b = await page.locator("#" + id).boundingBox();
        assert.ok(b.width >= 44 && b.height >= 44, id);
      }
      const a = await page.locator("#layersBtn").boundingBox(),
        b = await page.locator("#zoomIn").boundingBox();
      assert.ok(a.x + a.width <= b.x);
      await shot("map");
    });
    await check("zoom buttons, reset and map drag", async () => {
      const before = await page.locator("#oceanSVG").getAttribute("viewBox");
      await page.locator("#zoomIn").click();
      const after = await page.locator("#oceanSVG").getAttribute("viewBox");
      assert.ok(+after.split(" ")[2] < +before.split(" ")[2]);
      await page.mouse.move(190, 380);
      await page.mouse.down();
      await page.mouse.move(220, 400, { steps: 8 });
      await page.mouse.up();
      assert.notEqual(
        await page.locator("#oceanSVG").getAttribute("viewBox"),
        after,
      );
      assert.equal(await page.locator("#selectedSheet").isVisible(), false);
      await page.locator("#zoomHome").click();
    });
    if (engine === "chromium")
      await check(
        "native two-touch pinch changes map without opening sheet",
        async () => {
          const cdp = await context.newCDPSession(page);
          const before = +(
            await page.locator("#oceanSVG").getAttribute("viewBox")
          ).split(" ")[2];
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [
              { x: 90, y: 380, id: 1 },
              { x: 210, y: 380, id: 2 },
            ],
          });
          for (let i = 1; i <= 6; i++)
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [
                { x: 90 - i * 4, y: 380, id: 1 },
                { x: 210 + i * 4, y: 380, id: 2 },
              ],
            });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          const after = +(
            await page.locator("#oceanSVG").getAttribute("viewBox")
          ).split(" ")[2];
          assert.ok(after < before * 0.9);
          assert.equal(await page.locator("#selectedSheet").isVisible(), false);
          await page.locator("#zoomHome").click();
          await cdp.detach();
        },
      );
    await check(
      "area sheet expands, favourites persist and catch link filters",
      async () => {
        await page
          .getByRole("button", { name: "小網代湾口・荒井浜沖", exact: true })
          .click();
        await page
          .getByRole("button", { name: "詳細を広げる", exact: true })
          .click();
        assert.equal(await page.locator("#userAddArea").isVisible(), true);
        await page.locator("#areaFav").click();
        assert.equal(
          await page.locator("#areaFav").getAttribute("aria-pressed"),
          "true",
        );
        await shot("area");
        await page.locator("#areaReports").click();
        assert.equal(await page.locator("#reportAreaBanner").isVisible(), true);
        const list = await page.locator("#reportList").innerText();
        assert.ok(!list || list.includes("小網代"));
        assert.equal(await page.locator("#reportList .reportCard").count(), 2);
        await page.locator("#monthlyMode").click();
        assert.equal(await page.locator("#monthReports").isVisible(), true);
        assert.equal(await page.locator("#reportList").isVisible(), false);
        await page.locator("#mobileMonth").selectOption("10");
        assert.equal(
          await page.locator("#monthlyMode").getAttribute("aria-pressed"),
          "true",
        );
        await page.locator("#recentMode").click();
        assert.equal(await page.locator("#reportList").isVisible(), true);
        await page.locator("#clearReportArea").click();
        assert.ok((await page.locator("#reportList .reportCard").count()) > 2);
      },
    );
    await check(
      "month, group, season, search and area fish filters",
      async () => {
        await nav("◈ 地図");
        await page
          .getByRole("button", { name: "小網代湾口・荒井浜沖", exact: true })
          .click();
        await page.locator("#areaFish").click();
        assert.equal(await page.locator("#areaFilterBanner").isVisible(), true);
        assert.equal(await page.locator("#fishGrid .fishCard").count(), 3);
        await page.locator("#clearAreaFilter").click();
        await page.locator("#mobileMonth").selectOption("1");
        await page.locator("#novOnly").click();
        assert.equal(await page.locator("#novOnly").innerText(), "1月の候補");
        assert.ok((await page.locator("#fishGrid .fishCard").count()) < 47);
        await page.locator("#novOnly").click();
        await page.locator("#mobileGroup").selectOption("イカ");
        assert.equal(await page.locator("#fishGrid .fishCard").count(), 5);
        await page.locator("#mobileGroup").selectOption("all");
        await page.locator("#speciesSearch").fill("アオリ");
        assert.equal(await page.locator("#fishGrid .fishCard").count(), 1);
        await nav("◉ 記録");
        await nav("◎ 魚種");
        assert.equal(
          await page.locator("#speciesSearch").inputValue(),
          "アオリ",
        );
        await page.locator("#speciesSearch").fill("");
        await page
          .locator("#speciesView")
          .evaluate((el) => (el.scrollTop = 500));
        const scroll = await page
          .locator("#speciesView")
          .evaluate((el) => el.scrollTop);
        await nav("◉ 記録");
        await nav("◎ 魚種");
        assert.equal(
          await page.locator("#speciesView").evaluate((el) => el.scrollTop),
          scroll,
        );
        await page.locator("#speciesView").evaluate((el) => (el.scrollTop = 0));
        await shot("catalogue");
      },
    );
    await check(
      "all 47 local photographs decode and source detail is retained",
      async () => {
        await page.locator(".photoDiagnostics summary").click();
        await page.locator("#auditAllPhotos").click();
        await page.locator("#auditAllPhotos").waitFor({ state: "visible" });
        await page.waitForFunction(
          () => !document.getElementById("auditAllPhotos").disabled,
        );
        assert.match(
          await page.locator("#photoAuditStatus").innerText(),
          /47\/47/,
        );
        await page
          .getByRole("button", { name: "アオリイカの詳細", exact: true })
          .click();
        await page
          .locator("#modalContent .modalHero img")
          .waitFor({ state: "visible" });
        assert.ok(
          await page
            .locator("#modalContent a")
            .filter({ hasText: "ライセンス" })
            .count(),
        );
        assert.equal(
          await page
            .locator("#modalClose")
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await page.locator("#modalContent .modalHero").click();
        await page.locator("#photoViewer").waitFor({ state: "visible" });
        const before = await page
          .locator("#photoStage")
          .getAttribute("viewBox");
        await page.locator("#photoZoomIn").click();
        assert.notEqual(
          await page.locator("#photoStage").getAttribute("viewBox"),
          before,
        );
        if (engine === "chromium") {
          const box = await page.locator("#photoStage").boundingBox(),
            cdp = await context.newCDPSession(page),
            old = +(
              await page.locator("#photoStage").getAttribute("viewBox")
            ).split(" ")[2];
          const y = box.y + box.height / 2,
            x = box.x + box.width / 2;
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [
              { x: x - 40, y, id: 1 },
              { x: x + 40, y, id: 2 },
            ],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              { x: x - 65, y, id: 1 },
              { x: x + 65, y, id: 2 },
            ],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          assert.ok(
            +(await page.locator("#photoStage").getAttribute("viewBox")).split(
              " ",
            )[2] < old,
          );
          await cdp.detach();
        }
        await shot("photo");
        await page.locator("#photoReset").click();
        await page.locator("#photoClose").click();
        await page.locator("#modalClose").click();
        assert.equal(await page.locator("#modal").isVisible(), false);
      },
    );
    await check(
      "record form draft survives tab changes; invalid coordinates do not save",
      async () => {
        await nav("◉ 記録");
        await page.locator("#catchMemo").fill("QA draft");
        await nav("≋ 海況");
        await nav("◉ 記録");
        assert.equal(await page.locator("#catchMemo").inputValue(), "QA draft");
        await page.locator("#pointTitle").fill("invalid");
        await page.locator("#savePoint").click();
        assert.equal(await page.locator("#waypointCount").innerText(), "0件");
        await page.locator("#notice button").click();
      },
    );
    await check(
      "manual point and photo catch save, reload, JSON export and CSV",
      async () => {
        await page.locator("#pointTitle").fill("QA point");
        await page.locator("#pointLat").fill("35.16");
        await page.locator("#pointLon").fill("139.60");
        await page.locator("#savePoint").click();
        assert.equal(await page.locator("#waypointCount").innerText(), "1件");
        await page.locator("#notice button").click();
        await page
          .locator("#catchWaypoint")
          .selectOption({ label: "QA point" });
        await page.locator("#catchSize").fill("23");
        await page
          .locator("#catchPhoto")
          .setInputFiles(path.resolve("images/fish/0.jpg"));
        await page
          .getByRole("button", { name: "釣果を保存", exact: true })
          .click();
        await page.waitForFunction(
          () =>
            document.getElementById("personalCatchCount").textContent === "1件",
        );
        await page.locator("#notice button").click();
        const download = page.waitForEvent("download");
        await page.locator("#backupBtn").click();
        const file = await download;
        await file.saveAs(path.join(out, engine + "-backup.json"));
        const data = JSON.parse(
          await fs.readFile(path.join(out, engine + "-backup.json"), "utf8"),
        );
        assert.equal(data.version, 5);
        assert.equal(data.waypoints[0].name, "QA point");
        assert.ok(data.catches[0].photo.startsWith("data:image/jpeg"));
        const csv = page.waitForEvent("download");
        await page.locator("#csvBtn").click();
        await (await csv).saveAs(path.join(out, engine + "-catches.csv"));
        assert.match(
          await fs.readFile(path.join(out, engine + "-catches.csv"), "utf8"),
          /QA draft/,
        );
        await page.reload();
        await nav("◉ 記録");
        assert.equal(await page.locator("#waypointCount").innerText(), "1件");
        assert.equal(
          await page.locator("#personalCatchCount").innerText(),
          "1件",
        );
        assert.equal(await page.locator("#mobileMonth").inputValue(), "1");
        await shot("records");
      },
    );
    await check(
      "delete confirmation and JSON round-trip; malformed import preserves data",
      async () => {
        await page.locator("[data-remove-catch]").click();
        await page.locator("#actionCancel").click();
        assert.equal(
          await page.locator("#personalCatchCount").innerText(),
          "1件",
        );
        await page.locator("[data-remove-catch]").click();
        await page.locator("#actionSubmit").click();
        assert.equal(
          await page.locator("#personalCatchCount").innerText(),
          "0件",
        );
        await page
          .locator("#importJson")
          .setInputFiles(path.join(out, engine + "-backup.json"));
        await page.locator("#actionSubmit").click();
        assert.equal(
          await page.locator("#personalCatchCount").innerText(),
          "1件",
        );
        await page.locator("#notice button").click();
        await page.locator("#importJson").setInputFiles({
          name: "bad.json",
          mimeType: "application/json",
          buffer: Buffer.from(
            '{"waypoints":[{"name":"bad","lat":999}],"catches":[]}',
          ),
        });
        assert.equal(await page.locator("#waypointCount").innerText(), "1件");
        await page.locator("#notice button").click();
      },
    );
    await check(
      "map point confirmation, cancellation and drag do not create accidental points",
      async () => {
        await nav("◈ 地図");
        if (await page.locator("#selectedSheet").isVisible())
          await page.locator(".sheetClose").click();
        await page.locator("#markMapBtn").click();
        await page.mouse.move(150, 350);
        await page.mouse.down();
        await page.mouse.move(170, 370, { steps: 8 });
        await page.mouse.up();
        assert.equal(await page.locator("#actionDialog").isVisible(), false);
        await page.mouse.click(160, 350);
        await page.locator("#actionDialog").waitFor({ state: "visible" });
        await page.locator("#actionCancel").click();
        assert.equal(await page.locator("#draftPin").count(), 0);
        await page.locator("#markMapBtn").click();
        await page.mouse.click(160, 350);
        await page.locator("#actionContent input").fill("Map QA");
        await page.locator("#actionSubmit").click();
        await nav("◉ 記録");
        assert.equal(await page.locator("#waypointCount").innerText(), "2件");
        await page.locator("#notice button").click();
      },
    );
    await check("GPS success and outside-area position", async () => {
      await context.grantPermissions(["geolocation"]);
      await context.setGeolocation({
        latitude: 35.16,
        longitude: 139.6,
        accuracy: 15,
      });
      await page.locator("#saveMyLocation").click();
      await page.locator("#actionDialog").waitFor({ state: "visible" });
      assert.match(await page.locator("#actionContent").innerText(), /15m/);
      await page.locator("#actionCancel").click();
      await page.locator("#notice button").click();
      await context.setGeolocation({
        latitude: 35.68,
        longitude: 139.76,
        accuracy: 20,
      });
      await page.locator("#gpsFromLog").click();
      await page.waitForFunction(() =>
        document.querySelector("#notice span").textContent.includes("範囲外"),
      );
      await page.locator("#notice button").click();
      await context.clearPermissions();
      await context.grantPermissions([]);
      await page.reload();
      await nav("◉ 記録");
    });
    await check(
      "viewport matrix has no horizontal page overflow and usable menus",
      async () => {
        for (const size of [
          { width: 320, height: 568 },
          { width: 375, height: 667 },
          { width: 430, height: 932 },
          { width: 844, height: 390 },
          { width: 768, height: 1024 },
          { width: 1280, height: 800 },
        ]) {
          await page.setViewportSize(size);
          if (size.width > 900)
            await page.locator(".side [data-tab=species]").click();
          else await nav("◎ 魚種");
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          );
          assert.equal(overflow, false, JSON.stringify(size));
          await shot("layout-" + size.width + "x" + size.height);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await nav("◈ 地図");
        await page.locator("#layersBtn").click();
        assert.equal(await page.locator("#layersPanel").isVisible(), true);
        await page
          .getByRole("button", { name: "◈ 底質ガイド", exact: true })
          .click();
        assert.ok((await page.locator("#habitatOverlay circle").count()) > 0);
        await page.locator("#layersBtn").click();
      },
    );
    await check(
      "200% text enlargement, focus containment, reduced motion",
      async () => {
        await nav("◎ 魚種");
        await page.evaluate(
          () => (document.documentElement.style.fontSize = "32px"),
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
        );
        await shot("text-200");
        await page.evaluate(
          () => (document.documentElement.style.fontSize = ""),
        );
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page
          .getByRole("button", { name: "アオリイカの詳細", exact: true })
          .click();
        await page.keyboard.press("Shift+Tab");
        assert.equal(
          await page
            .locator("#modalContent")
            .evaluate((el) => el.contains(document.activeElement)),
          true,
        );
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("#modal").isVisible(), false);
      },
    );
    await check("browser runtime has no uncaught errors", async () =>
      assert.deepEqual(errors, []),
    );
  } catch (error) {
    await shot("failure");
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  try {
    for (const engine of (
      process.env.SEABORNIA_BROWSERS || "chromium,webkit"
    ).split(","))
      await run(engine);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await fs.writeFile(
      path.join(out, "results.json"),
      JSON.stringify({ base, results }, null, 2),
    );
  }
})();
