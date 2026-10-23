const { chromium } = require(process.env.SEABORNIA_PLAYWRIGHT || "playwright"),
  fs = require("node:fs/promises"),
  assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({ headless: true, channel: "chrome" }),
    p = await b.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    rows = [];
  const out = process.env.SEABORNIA_QA_DIR || "/tmp/seastyle-v8-accessibility";
  await fs.mkdir(out, { recursive: true });
  async function scan(name) {
    await p.addScriptTag({
      path: "/tmp/seabornia-qa-tools/node_modules/axe-core/axe.min.js",
    });
    const r = await p.evaluate(() =>
      axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      }),
    );
    rows.push({
      name,
      violations: r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    });
    console.log(name, rows.at(-1).violations);
  }
  try {
    await p.goto(process.env.SEABORNIA_URL || "http://127.0.0.1:8765/");
    await p.waitForTimeout(1000);
    for (const tab of ["map", "species", "latest", "plan", "log"]) {
      await p.locator(".mobileNav [data-tab=" + tab + "]").click();
      await scan(tab);
    }
    await p.locator("#destinationBtn").click();
    await scan("regional-discovery");
    await p.locator("[data-region=okinawa]").click();
    await p.locator('[data-card="J47-0010"] button').click();
    await scan("marina-preview");
    await p.locator("#openMarinaWorkspace").click();
    await p.locator(".mobileNav [data-tab=plan]").click();
    await scan("okinawa-conditions");
    await p.locator(".mobileNav [data-tab=species]").click();
    await p.locator('.fishCard[data-id="regional-gurukun"]').click();
    await scan("regional-fish-detail");
    await p.locator("#modalClose").click();
    await p.locator("#pickSpeciesArea").click();
    await scan("okinawa-area-picker");
    assert.ok(rows.every((r) => r.violations.length === 0));
  } finally {
    await fs.writeFile(
      out + "/accessibility.json",
      JSON.stringify(rows, null, 2),
    );
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
