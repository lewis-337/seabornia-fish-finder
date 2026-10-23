/* Multi-marina browser acceptance. Isolated browser contexts; no user records. */
const { chromium, webkit } = require(
  process.env.SEABORNIA_PLAYWRIGHT || "playwright",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  http = require("node:http");
const base = process.env.SEABORNIA_URL || "http://127.0.0.1:8765/",
  out = process.env.SEABORNIA_QA_DIR || "/tmp/seastyle-v8-marinas",
  results = [];
async function run(engine) {
  let unreachable = false,
    proxy = null,
    urlBase = base;
  if (engine === "webkit" && !process.env.SEABORNIA_URL) {
    proxy = http.createServer(async (req, res) => {
      if (unreachable) {
        req.socket.destroy();
        return;
      }
      try {
        const rel = new URL(req.url, "http://localhost").pathname;
        const file = path.resolve("." + (rel === "/" ? "/index.html" : rel));
        if (!file.startsWith(process.cwd() + path.sep)) throw Error("path");
        const body = await fs.readFile(file);
        const type =
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".jpg": "image/jpeg",
            ".png": "image/png",
            ".svg": "image/svg+xml",
            ".webmanifest": "application/manifest+json",
          }[path.extname(file)] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": type });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
    urlBase = "http://127.0.0.1:" + proxy.address().port + "/";
  }

  const b = await { chromium, webkit }[engine].launch({
      headless: true,
      ...(engine === "chromium" ? { channel: "chrome" } : {}),
    }),
    ctx = await b.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: "ja-JP",
    }),
    p = await ctx.newPage(),
    errors = [],
    requests = [];
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => requests.push(r.url()));
  async function check(label, fn) {
    try {
      await fn();
      results.push({ engine, label, status: "pass" });
      console.log("PASS", engine, label);
    } catch (e) {
      results.push({ engine, label, status: "fail", error: e.message });
      await p.screenshot({ path: path.join(out, engine + "-FAILED.png") });
      throw e;
    }
  }
  const nav = (tab) => p.locator(".nav[data-tab=" + tab + "]:visible").click();
  async function picker() {
    await p.locator("#destinationBtn").click();
    await p.locator("[data-region=all]").click();
    await p.locator("#destinationFish").selectOption("");
    await p.locator("#destinationMethod").selectOption("all");
  }
  async function open(id) {
    await picker();
    await p.locator('[data-card="' + id + '"] button').click();
    await p.locator("#openMarinaWorkspace").click();
    await p.waitForFunction(
      (id) =>
        JSON.parse(localStorage.getItem("seabornia-workspaces-v1"))
          .activeMarinaId === id,
      id,
    );
    await p.locator("#destinations").waitFor({ state: "hidden" });
  }
  try {
    await ctx.addInitScript(() => {
      if (!localStorage.getItem("seabornia-v4-points"))
        localStorage.setItem(
          "seabornia-v4-points",
          JSON.stringify([
            {
              id: "legacy",
              name: "旧ポイント",
              lat: 35.16,
              lng: 139.6,
              precision: "GPS",
            },
          ]),
        );
      if (!localStorage.getItem("seabornia-v4-catches"))
        localStorage.setItem(
          "seabornia-v4-catches",
          JSON.stringify([
            {
              id: "oldcatch",
              date: "2026-10-01",
              fish: "マダイ",
              count: "1",
              photo: "",
            },
          ]),
        );
    });
    await p.goto(urlBase);
    await p.waitForFunction(() =>
      [...document.querySelectorAll("#destinationFish option")].some(
        (o) => o.value === "グルクン",
      ),
    );
    await check("regional inventory, clusters and fish filters", async () => {
      await picker();
      assert.equal(await p.locator(".destinationCard").count(), 25);
      for (const id of [
        "destinationFish",
        "destinationMonth",
        "destinationMethod",
      ])
        assert.ok(
          (await p.locator("#" + id).boundingBox()).height >= 44,
          id + " touch target",
        );
      assert.equal(
        (await p.locator("[data-marina-cluster]").count()) > 0,
        true,
      );
      for (const b of await p.locator(".regionalPins [role=button]").all()) {
        const r = await b.boundingBox();
        assert.ok(
          r.width >= 44 && r.height >= 44,
          "regional marker touch target",
        );
      }
      const cluster = p.locator("[data-marina-cluster]").first();
      await cluster.click();
      await p.locator("[data-reset-region=kanto]").click();
      await p.locator("[data-region=okinawa]").click();
      assert.equal(await p.locator(".destinationCard").count(), 3);
      await p.locator("#destinationFish").selectOption("グルクン");
      await p.locator("#destinationMonth").selectOption("1");
      await p.locator("#destinationMethod").selectOption("bait");
      assert.equal(await p.locator(".destinationCard").count(), 1);
      await p.screenshot({
        path: path.join(out, engine + "-okinawa-fish.png"),
      });
    });
    await check("preview cancellation keeps current marina", async () => {
      await p.locator(".destinationCard button").click();
      await p.locator("#destinationClose").click();
      assert.match(
        await p.locator("#activeMarinaName").innerText(),
        /シーボニア/,
      );
    });
    await check(
      "explicit marina switch and source-backed local fish/ground links",
      async () => {
        await open("J47-0010");
        assert.match(await p.locator("#activeMarinaName").innerText(), /北谷/);
        await nav("species");
        await p.locator("#speciesSearch").fill("グルクン");
        await p.locator(".fishCard").click();
        assert.match(await p.locator("#fishAreas").innerText(), /北谷/);
        assert.match(await p.locator("#fishAreas").innerText(), /GEBCO/);
        await p.locator("#otherMarinasForFish").click();
        assert.equal(
          await p.locator("#destinationFish").inputValue(),
          "グルクン",
        );
        await p.locator("#destinationClose").click();
        await nav("log");
        assert.equal(await p.locator("#waypointCount").innerText(), "0件");
        assert.match(await p.locator("#recordMarina").innerText(), /北谷/);
      },
    );
    await check(
      "private point and catch saved only to the active marina",
      async () => {
        await p.locator("#pointTitle").fill("沖縄QA");
        await p.locator("#pointLat").fill("26.315");
        await p.locator("#pointLon").fill("127.71");
        await p.locator("#savePoint").click();
        await p.locator("#catchFish").selectOption("グルクン");
        await p.locator("#catchTime").fill("18:00");
        await p.locator("#catchWaypoint").selectOption({ label: "沖縄QA" });
        await p.locator("#catchMemo").fill("沖縄で保存");
        await p.locator("#catchForm [type=submit]").click();
        await p.waitForFunction(
          () =>
            document.querySelector("#personalCatchCount").textContent === "1件",
        );
        const rows = await p.evaluate(() => [
          ...JSON.parse(localStorage.getItem("seabornia-v4-catches")),
          ...JSON.parse(
            localStorage.getItem("seabornia-marina-records-v1") ||
              '{"catches":[]}',
          ).catches,
        ]);
        assert.equal(
          rows.find((r) => r.fish === "グルクン").marinaId,
          "J47-0010",
        );
        assert.equal(rows.find((r) => r.id === "oldcatch").time, undefined);
        const legacy = rows.filter(
          (r) => !r.marinaId || r.marinaId === "J14-0170",
        );
        await p.evaluate(
          (r) =>
            localStorage.setItem("seabornia-v4-catches", JSON.stringify(r)),
          legacy,
        );
        assert.ok(
          await p.evaluate(() =>
            JSON.parse(
              localStorage.getItem("seabornia-marina-records-v1"),
            ).catches.some((r) => r.fish === "グルクン"),
          ),
        );
        await p.locator("#notice button").click();
        await p.locator("#catchMemo").fill("次回の下書き");
        await p.locator("#catchDate").fill("2026-11-01");
        await p.locator("#catchTime").fill("08:45");
      },
    );
    await check("speed, tide station and global return reminder", async () => {
      await nav("plan");
      await p.locator("#boatSettings").evaluate((e) => (e.open = true));
      await p.locator("#cruiseSpeed").fill("18");
      await p.locator("#returnDate").fill("2026-12-01");
      await p.locator("#returnTime").fill("15:00");
      await p.locator("#tripForm [type=submit]").click();
      await p.waitForFunction(() =>
        document.querySelector("#tripTide").textContent.includes("都屋"),
      );
      assert.ok(!(await p.locator("#tripTide").innerText()).includes("油壺"));
      assert.match(await p.locator("#returnDetails").innerText(), /北谷/);
    });
    await check(
      "A-B-A switching preserves drafts, records and independent boat speeds",
      async () => {
        await open("J47-0020");
        await nav("plan");
        assert.equal(await p.locator("#cruiseSpeed").inputValue(), "");
        assert.match(await p.locator("#returnDetails").innerText(), /北谷/);
        await nav("log");
        assert.equal(await p.locator("#waypointCount").innerText(), "0件");
        await open("J47-0010");
        await nav("log");
        assert.equal(
          await p.locator("#catchMemo").inputValue(),
          "次回の下書き",
        );
        assert.equal(await p.locator("#catchDate").inputValue(), "2026-11-01");
        assert.equal(await p.locator("#catchTime").inputValue(), "08:45");
        assert.equal(await p.locator("#personalCatchCount").innerText(), "1件");
        await open("J14-0170");
        await nav("log");
        assert.equal(await p.locator("#waypointCount").innerText(), "1件");
        assert.equal(await p.locator("#personalCatchCount").innerText(), "1件");
      },
    );
    await check(
      "backup v6 contains all bases and legacy import preserves Okinawa",
      async () => {
        const pending = p.waitForEvent("download");
        await p.locator("#backupBtn").click();
        const d = await pending;
        await d.saveAs(path.join(out, engine + "-all.json"));
        const obj = JSON.parse(
          await fs.readFile(path.join(out, engine + "-all.json"), "utf8"),
        );
        assert.equal(obj.version, 6);
        assert.equal(obj.catches.length, 2);
        assert.ok(obj.workspaces.workspaces["J47-0010"]);
        await p.locator("#importJson").setInputFiles({
          name: "legacy.json",
          mimeType: "application/json",
          buffer: Buffer.from(
            JSON.stringify({ version: 4, waypoints: [], catches: [] }),
          ),
        });
        await p.locator("#actionSubmit").click();
        await p.waitForFunction(
          () =>
            document.querySelector("#personalCatchCount").textContent === "0件",
        );
        const records = await p.evaluate(() => [
          ...JSON.parse(localStorage.getItem("seabornia-v4-catches")),
          ...JSON.parse(
            localStorage.getItem("seabornia-marina-records-v1") ||
              '{"catches":[]}',
          ).catches,
        ]);
        assert.equal(records.length, 1);
        assert.equal(records[0].marinaId, "J47-0010");
        await p
          .locator("#importJson")
          .setInputFiles(path.join(out, engine + "-all.json"));
        await p.locator("#actionSubmit").click();
        await p.waitForFunction(
          () =>
            document.querySelector("#personalCatchCount").textContent === "1件",
        );
      },
    );
    await check(
      "v6 restores its last active marina and return reminder",
      async () => {
        await nav("log");
        const obj = JSON.parse(
          await fs.readFile(path.join(out, engine + "-all.json"), "utf8"),
        );
        obj.workspaces.activeMarinaId = "J47-0010";
        await p.locator("#importJson").setInputFiles({
          name: "active-okinawa.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(obj)),
        });
        await p.locator("#actionSubmit").click();
        await p.waitForFunction(() =>
          document
            .querySelector("#activeMarinaName")
            .textContent.includes("北谷"),
        );
        await nav("plan");
        assert.match(await p.locator("#returnDetails").innerText(), /北谷/);
      },
    );
    await check(
      "responsive boundaries, enlarged text and keyboard-sized viewports",
      async () => {
        await open("J47-0010");
        for (const [w, h] of [
          [320, 844],
          [375, 812],
          [390, 844],
          [430, 932],
          [844, 390],
          [768, 1024],
          [1280, 850],
          [390, 440],
        ]) {
          await p.setViewportSize({ width: w, height: h });
          for (const scale of [1, 2]) {
            await p.evaluate(
              (s) => (document.documentElement.style.fontSize = 16 * s + "px"),
              scale,
            );
            await nav("log");
            await p.locator("#catchTime").focus();
            for (const id of [
              "catchDate",
              "catchTime",
              "catchMemo",
              "pointLat",
              "pointLon",
            ]) {
              const ok = await p.locator("#" + id).evaluate((e) => {
                const a = e.getBoundingClientRect(),
                  b = e.closest("label").getBoundingClientRect();
                return (
                  a.left >= b.left - 1 &&
                  a.right <= b.right + 1 &&
                  e.scrollWidth <= e.clientWidth + 1
                );
              });
              assert.ok(ok, `${w}@${scale} ${id}`);
            }
            await nav("map");
            const overflow = await p.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            );
            assert.equal(overflow, false, `${w}@${scale}`);
            await picker();
            await p.locator("[data-region=okinawa]").click();
            assert.equal(
              await p.evaluate(
                () =>
                  document.querySelector(".destinationBody").scrollWidth >
                  document.querySelector(".destinationBody").clientWidth,
              ),
              false,
              `${w}@${scale} picker`,
            );
            if (w === 320 || w === 844)
              await p.screenshot({
                path: path.join(out, engine + `-${w}-${scale}x.png`),
              });
            await p.locator("#destinationClose").click();
          }
        }
        await p.evaluate(
          () => (document.documentElement.style.fontSize = "16px"),
        );
        await p.setViewportSize({ width: 390, height: 844 });
      },
    );
    await check(
      "all public assets cached; never-visited base opens offline",
      async () => {
        await picker();
        await p.waitForFunction(
          () =>
            document
              .querySelector("#offlinePackStatus")
              .textContent.startsWith("全マリーナ"),
          { timeout: 30000 },
        );
        await p.locator("#destinationClose").click();
        await p.evaluate(() => navigator.serviceWorker.ready);
        await p.waitForFunction(() => !!navigator.serviceWorker.controller);
        const missing = await p.evaluate(async () => {
          const files = (
              await (await fetch("./data/offline-packs.json")).json()
            ).assets,
            c = await caches.open("seabornia-marina-packs-v8");
          const bad = [];
          for (const f of files)
            if (!(await c.match(new URL(f, location.href).href))) bad.push(f);
          return bad;
        });
        assert.deepEqual(missing, []);
        if (proxy) unreachable = true;
        else await ctx.setOffline(true);
        await p.reload({ waitUntil: "domcontentloaded" });
        await p.waitForFunction(() =>
          document
            .querySelector("#activeMarinaName")
            .textContent.includes("北谷"),
        );
        await open("J08-0040");
        await nav("plan");
        await p.waitForFunction(() =>
          document.querySelector("#tripTide").textContent.includes("大洗"),
        );
        if (proxy) unreachable = false;
        else await ctx.setOffline(false);
      },
    );
    await check(
      "no private-coordinate provider calls or uncaught errors",
      async () => {
        assert.deepEqual(errors, []);
        assert.equal(
          requests.some((u) => /api.open-meteo|marine-api|api.tide736/.test(u)),
          false,
        );
      },
    );
  } finally {
    await ctx.close();
    await b.close();
    if (proxy) await new Promise((r) => proxy.close(r));
  }
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  try {
    for (const e of (process.env.SEABORNIA_BROWSERS || "chromium,webkit").split(
      ",",
    ))
      await run(e);
  } finally {
    await fs.writeFile(
      path.join(out, "marinas-results.json"),
      JSON.stringify(results, null, 2),
    );
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
