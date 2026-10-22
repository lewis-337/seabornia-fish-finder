/* Native Chromium two-touch input; WebKit camera regressions are in test_gestures.cjs.
   This is desktop browser input emulation, not physical iPhone acceptance. */
const { chromium } = require(process.env.SEABORNIA_PLAYWRIGHT || "playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
const base = process.env.SEABORNIA_URL || "http://127.0.0.1:8765/",
  out = process.env.SEABORNIA_QA_DIR || "/tmp/seabornia-v7-touch",
  results = [];
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" }),
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: "block",
    }),
    p = await context.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(p);
  async function check(label, fn) {
    try {
      await fn();
      results.push({ label, status: "pass" });
      console.log("PASS", label);
    } catch (e) {
      results.push({ label, status: "fail", error: e.message });
      throw e;
    }
  }
  const view = async (selector) =>
    (await p.locator(selector).getAttribute("viewBox")).split(" ").map(Number);
  async function gesture(selector) {
    const r = await p.locator(selector).boundingBox(),
      x = r.x + r.width * 0.48,
      y = r.y + r.height * 0.45;
    const pts = (span, dx = 0, dy = 0) => [
      { id: 1, x: x - span + dx, y: y + dy },
      { id: 2, x: x + span + dx, y: y + dy },
    ];
    const send = async (type, touchPoints) => {
      await cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
      await p.waitForTimeout(60);
    };
    const start = await view(selector);
    await send("touchStart", pts(35));
    await send("touchMove", pts(65));
    const spread = await view(selector);
    assert.ok(spread[2] < start[2], "spread zooms in");
    await send("touchMove", pts(47));
    const contracted = await view(selector);
    assert.ok(contracted[2] > spread[2], "contract zooms out");
    await send("touchMove", pts(47, 20, 12));
    const moved = await view(selector);
    assert.notDeepEqual(
      moved.slice(0, 2),
      contracted.slice(0, 2),
      "midpoint pans",
    );
    await send("touchMove", [pts(47, 20, 12)[0]]);
    assert.deepEqual(await view(selector), moved, "two to one has no jump");
    await send("touchMove", [{ id: 1, x: x - 47 + 38, y: y + 25 }]);
    assert.notDeepEqual(await view(selector), moved, "one finger continues");
    await send("touchCancel", []);
    const cancelled = await view(selector);
    await send("touchStart", [{ id: 3, x, y }]);
    await send("touchCancel", []);
    assert.deepEqual(
      await view(selector),
      cancelled,
      "cancelled touch does not jump",
    );
  }
  try {
    await p.goto(base);
    await p.locator("[data-area]").first().waitFor();
    await check(
      "map spread/contract, moving midpoint, finger transitions and cancellation",
      async () => {
        await gesture("#oceanSVG");
        assert.equal(await p.locator("#selectedSheet").isVisible(), false);
        assert.equal(await p.locator("#actionDialog").isVisible(), false);
        await p.locator("#zoomHome").click();
        await p.locator("[data-area=koajiro]").tap();
        assert.equal(await p.locator("#selectedSheet").isVisible(), true);
        await p.locator(".sheetClose").click();
      },
    );
    await check(
      "point mode pinch never creates a waypoint or opens its save form",
      async () => {
        await p.locator("#markMapBtn").click();
        await gesture("#oceanSVG");
        assert.equal(await p.locator("#actionDialog").isVisible(), false);
        assert.equal(
          await p.evaluate(() => localStorage.getItem("seabornia-v4-points")),
          null,
        );
        await p.locator("#markMapBtn").click();
      },
    );
    await check(
      "area picker pinch never confirms or changes the fish filter",
      async () => {
        await p.locator(".mobileNav [data-tab=species]").click();
        await p.locator("#pickSpeciesArea").click();
        await gesture("#oceanSVG");
        assert.equal(await p.locator("#areaPicker").isVisible(), true);
        assert.equal(await p.locator("#pickerConfirm").isDisabled(), true);
        await p.locator("#pickerCancel").click();
        assert.equal(await p.locator("#speciesArea").inputValue(), "");
      },
    );
    await check(
      "photo spread/contract, pan, finger transitions, cancellation and reset",
      async () => {
        await p.locator(".fishCard").first().click();
        await p.locator(".modalHero").click();
        await p.locator("#photoViewer").waitFor();
        const initial = await view("#photoStage");
        await gesture("#photoStage");
        await p.locator("#photoReset").click();
        assert.deepEqual(await view("#photoStage"), initial);
        await p.screenshot({ path: path.join(out, "photo-reset.png") });
        await p.locator("#photoClose").click();
        await p.locator("#modalClose").click();
      },
    );
    await check("touch checks have no uncaught runtime errors", async () =>
      assert.deepEqual(errors, []),
    );
  } catch (e) {
    console.error(e);
    await p.screenshot({ path: path.join(out, "FAILED.png") });
    process.exitCode = 1;
  } finally {
    await fs.writeFile(
      path.join(out, "touch-results.json"),
      JSON.stringify(results, null, 2),
    );
    await context.close();
    await browser.close();
  }
})();
