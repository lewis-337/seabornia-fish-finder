/* Source-rich profiles, complete photo catalogue, root scrolling and tap-to-top. */
const { chromium, webkit } = require(
    process.env.SEABORNIA_PLAYWRIGHT || "playwright",
  ),
  fs = require("node:fs/promises"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const out = process.env.SEABORNIA_QA_DIR || "/tmp/seastyle-v9-content",
  url = process.env.SEABORNIA_URL || "http://127.0.0.1:8765/",
  results = [];
(async () => {
  await fs.mkdir(out, { recursive: true });
  for (const engine of (
    process.env.SEABORNIA_BROWSERS || "chromium,webkit"
  ).split(",")) {
    const browser = await { chromium, webkit }[engine].launch({
        headless: true,
        ...(engine === "chromium" ? { channel: "chrome" } : {}),
      }),
      p = await browser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        locale: "ja-JP",
        reducedMotion: "reduce",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    async function check(label, fn) {
      await fn();
      results.push({ engine, label, status: "pass" });
      console.log("PASS", engine, label);
    }
    try {
      await p.goto(url);
      await p.waitForFunction(() =>
        [...document.querySelectorAll("#destinationFish option")].some(
          (x) => x.value === "グルクン",
        ),
      );
      await check(
        "all24 selectable marinas have individual profiles; suspended and fleetless bases are absent",
        async () => {
          await p.locator("#destinationBtn").click();
          await p.locator("[data-region=all]").click();
          assert.equal(await p.locator(".destinationCard").count(), 24);
          assert.equal(
            await p
              .locator(
                '[data-card="J14-0180"],[data-card="J08-0020"],[data-card="J12-0040"]',
              )
              .count(),
            0,
          );
          assert.ok(
            !(await p.locator("#directoryAudit").innerText()).includes(
              "休止中",
            ),
          );
          for (const id of await p
            .locator(".destinationCard")
            .evaluateAll((xs) => xs.map((x) => x.dataset.card))) {
            await p.locator(`[data-card="${id}"] button`).click();
            assert.ok(
              (await p.locator(".marinaBrief").innerText()).length > 70,
              id,
            );
            await p.locator(".marinaBrief summary").click();
            for (const label of [
              "所在地",
              "電話",
              "営業時間",
              "定休日",
              "駐車場",
            ])
              assert.ok(
                (await p.locator(".marinaFacts").innerText()).includes(label),
                id + label,
              );
            await p.locator("#closeMarinaPreview").click();
          }
          await p.locator("#destinationClose").click();
        },
      );
      await check(
        "57 real photos decode, original barracuda mismatch fixed, group examples labelled",
        async () => {
          await p.locator(".nav[data-tab=species]:visible").click();
          await p.locator(".photoDiagnostics summary").click();
          await p.locator("#auditAllPhotos").click();
          await p.waitForFunction(
            () => !document.querySelector("#auditAllPhotos").disabled,
          );
          assert.match(
            await p.locator("#photoAuditStatus").innerText(),
            /57\/57/,
          );
          await p.locator("#speciesSearch").fill("グルクン");
          assert.match(
            await p.locator(".fishCard").innerText(),
            /代表例：タカサゴ/,
          );
          await p.locator(".fishCard").click();
          assert.match(
            await p.locator(".photoExampleDetail").innerText(),
            /代表例：タカサゴ/,
          );
          assert.ok(
            (await p.locator(".modalHero img").getAttribute("alt")).includes(
              "タカサゴ",
            ),
          );
          await p.locator("#modalClose").click();
          await p.locator("#speciesSearch").fill("");
        },
      );
      await check(
        "mobile document scroll, header tap-to-top, tab scroll restoration and preserved draft",
        async () => {
          await p.locator(".nav[data-tab=log]:visible").click();
          await p.locator("#catchMemo").fill("先頭ボタンでも下書きを保持");
          await p.evaluate(() => window.scrollTo(0, 700));
          await p.waitForFunction(() => window.scrollY > 300);
          await p.locator("#scrollTopBtn").click();
          await p.waitForFunction(() => window.scrollY === 0);
          assert.equal(
            await p.locator("#catchMemo").inputValue(),
            "先頭ボタンでも下書きを保持",
          );
          await p.locator(".nav[data-tab=species]:visible").click();
          await p.evaluate(() => window.scrollTo(0, 500));
          await p.waitForFunction(() => window.scrollY === 500);
          await p.locator(".nav[data-tab=log]:visible").click();
          await p.locator(".nav[data-tab=species]:visible").click();
          assert.equal(await p.evaluate(() => window.scrollY), 500);
          await p.locator("#scrollTopBtn").focus();
          await p.keyboard.press("Enter");
          await p.waitForFunction(() => window.scrollY === 0);
        },
      );
      await check(
        "root scroll positions remain separate for each marina",
        async () => {
          async function openBase(id) {
            await p.locator("#destinationBtn").click();
            await p.locator("#clearDestinationFilters").click();
            await p.locator("[data-region=all]").click();
            await p.locator(`[data-card="${id}"] button`).click();
            await p.locator("#openMarinaWorkspace").click();
            await p.locator("#destinations").waitFor({ state: "hidden" });
          }
          await p.locator(".nav[data-tab=species]:visible").click();
          await p.evaluate(() => window.scrollTo(0, 400));
          await p.waitForFunction(() => window.scrollY === 400);
          await openBase("J47-0010");
          await p.locator(".nav[data-tab=species]:visible").click();
          assert.equal(await p.evaluate(() => window.scrollY), 0);
          await openBase("J14-0170");
          await p.locator(".nav[data-tab=species]:visible").click();
          assert.equal(await p.evaluate(() => window.scrollY), 400);
          await p.locator("#scrollTopBtn").click();
        },
      );
      await check(
        "dialog top action and narrow/large-text source profiles stay inside field boundaries",
        async () => {
          await p.locator("#destinationBtn").click();
          await p.locator("[data-region=okinawa]").click();
          await p.locator('[data-card="J47-0010"] button').click();
          await p.locator("#previewGrounds .fishAreaRow").first().waitFor();
          await p.locator("#previewGrounds").scrollIntoViewIfNeeded();
          await p.locator("#destinationScrollTop").click();
          await p.waitForFunction(
            () => document.querySelector(".destinationBody").scrollTop === 0,
          );
          for (const [w, h, scale] of [
            [320, 740, 1],
            [320, 740, 2],
            [844, 390, 1],
            [430, 900, 1],
          ]) {
            await p.setViewportSize({ width: w, height: h });
            await p.evaluate(
              (s) => (document.documentElement.style.fontSize = 16 * s + "px"),
              scale,
            );
            await p.locator('[data-card="J47-0010"] button').click();
            await p.locator(".marinaBrief summary").click();
            const bad = await p
              .locator(
                "#destinations button,#destinations input,#destinations select,#destinations .marinaFacts dd",
              )
              .evaluateAll((xs) =>
                xs
                  .filter((x) => {
                    const r = x.getBoundingClientRect();
                    return r.width && (r.left < 0 || r.right > innerWidth + 1);
                  })
                  .map((x) => x.id || x.className),
              );
            assert.deepEqual(bad, []);
            await p.screenshot({
              path: path.join(
                out,
                engine + "-profile-" + w + "-" + scale + "x.png",
              ),
            });
            await p.locator("#closeMarinaPreview").click();
          }
          await p.locator("#destinationClose").click();
        },
      );
      await check("no uncaught runtime errors", async () =>
        assert.deepEqual(errors, []),
      );
    } finally {
      await browser.close();
    }
  }
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await fs.writeFile(
      path.join(out, "content-results.json"),
      JSON.stringify(results, null, 2),
    );
  });
