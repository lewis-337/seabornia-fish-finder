/* Isolated synthetic browser sessions. AI responses are fixtures, never paid calls. */
const { chromium, webkit } = require(process.env.SEABORNIA_PLAYWRIGHT || "playwright");
const AxeBuilder = require(process.env.SEABORNIA_AXE || "@axe-core/playwright").default;
const fs = require("node:fs/promises"), path = require("node:path"), assert = require("node:assert/strict");
const base = process.env.SEABORNIA_URL || "http://127.0.0.1:8765/";
const out = process.env.SEABORNIA_QA_DIR || "/tmp/sff-chat-qa/results";
const results = [];
async function run(engine) {
  const browser = await { chromium, webkit }[engine].launch({ headless: true, ...(engine === "chromium" ? { channel: "chrome" } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", locale: "ja-JP" });
  const page = await context.newPage(), errors = [], requests = [];
  let stage = "startup";
  page.on("pageerror", e => errors.push({ stage, message: e.message }));
  const reload = async () => {
    await page.waitForFunction(() => /全マリーナ|未完了/.test(document.querySelector("#offlinePackStatus").textContent));
    await page.reload();
  };
  const nav = tab => page.locator('.nav[data-tab="' + tab + '"]:visible').click();
  async function check(label, fn) { stage = label; await fn(); results.push({ engine, label, status: "pass" }); console.log("PASS", engine, label); }
  async function ask(q) { const count = await page.locator(".chatAssistant").count(); await page.locator("#chatQuestion").fill(q); await page.locator("#chatSend").click(); await page.waitForFunction(n => document.querySelectorAll(".chatAssistant").length > n, count); }
  async function switchMarina(id) {
    await page.locator("#destinationBtn").click(); await page.locator('[data-region="all"]').click();
    await page.locator("#destinationFish").selectOption(""); await page.locator("#destinationMethod").selectOption("all");
    await page.locator('[data-card="' + id + '"] button').click(); await page.locator("#openMarinaWorkspace").click();
    await page.waitForFunction(id => JSON.parse(localStorage.getItem("seabornia-workspaces-v1")).activeMarinaId === id, id);
    await page.locator("#destinations").waitFor({ state: "hidden" }); await nav("chat");
  }
  try {
    await context.route("**/data/chat-config-v11.json", route => route.fulfill({ json: { enabled: false, endpoint: "" } }));
    await page.goto(base); await page.locator("#oceanSVG [data-area]").first().waitFor();
    await check("six navigation targets, honest unconnected state and sourced 大潮 answer", async () => {
      assert.equal(await page.locator(".mobileNav [data-tab]").count(), 6); await nav("chat");
      await page.waitForFunction(() => !document.querySelector("#chatSend").disabled);
      assert.equal(await page.locator("#chatModeAI").isDisabled(), true); assert.match(await page.locator("#chatAvailability").innerText(), /準備中/);
      await page.screenshot({ path: path.join(out, engine + "-chat-start.png") });
      await ask("大潮とは？"); assert.match(await page.locator(".chatAssistant").innerText(), /満潮と干潮の潮位差/);
      await page.locator(".chatSources summary").click(); assert.match(await page.locator(".chatSources a").first().getAttribute("href"), /data.jma.go.jp/);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, engine + "-tide-answer.png") });
    });
    await check("English question, no-match behavior and text-only injection handling", async () => {
      await ask("What is a spring tide?"); assert.match(await page.locator(".chatAssistant").last().innerText(), /larger difference/);
      await page.locator("#chatClear").click(); await ask("asdfghjkl"); assert.match(await page.locator(".chatAssistant").innerText(), /見つかりません/);
      await ask('<img src=x onerror="window.chatInjected=1">'); assert.equal(await page.evaluate(() => window.chatInjected), undefined);
      assert.equal(await page.locator("#chatTranscript img").count(), 0);
    });
    await check("marina-specific conversations and unsent drafts survive A–B–A switching", async () => {
      await page.locator("#chatClear").click(); await ask("大潮とは？"); await page.locator("#chatQuestion").fill("シーボニアの下書き");
      await switchMarina("J47-0010"); assert.equal(await page.locator(".chatMessage").count(), 0); assert.equal(await page.locator("#chatQuestion").inputValue(), "");
      await ask("利用条件は？"); await page.locator("#chatQuestion").fill("沖縄の下書き");
      await switchMarina("J14-0170"); assert.match(await page.locator(".chatAssistant").innerText(), /大潮/); assert.equal(await page.locator("#chatQuestion").inputValue(), "シーボニアの下書き");
    });
    await check("portrait, landscape, desktop and 200% text have no page overflow", async () => {
      for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 850]]) {
        await page.setViewportSize({ width, height }); await nav("chat");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + "px overflow");
        assert.ok((await page.locator("#chatQuestion").boundingBox()).width > 150);
        assert.ok((await page.locator("#chatSend").boundingBox()).height >= 44);
      }
      await page.setViewportSize({ width: 390, height: 844 }); await page.addStyleTag({ content: "html{font-size:200% !important}" });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(out, engine + "-large-text.png"), fullPage: true });
    });
    await check("chat screen has no automated WCAG A/AA violations", async () => {
      const scan = await new AxeBuilder({ page }).include("#chatView").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      await fs.writeFile(path.join(out, engine + "-axe.json"), JSON.stringify(scan.violations, null, 2));
      assert.deepEqual(scan.violations.map(v => v.id), []);
    });
    await check("reference answers remain available offline after loading", async () => {
      // Initial marina-pack downloads must finish before deliberately cutting the network.
      await page.waitForFunction(() => /全マリーナ|未完了/.test(document.querySelector("#offlinePackStatus").textContent));
      await context.setOffline(true); await page.locator("#chatClear").click(); await ask("小潮とは？");
      assert.match(await page.locator(".chatAssistant").innerText(), /小潮/); await context.setOffline(false);
    });
    await check("connected AI request uses only explicit question, public marina ID and conversation", async () => {
      await context.route("**/data/chat-config-v11.json", route => route.fulfill({ json: { enabled: true, endpoint: "https://sff-chat.test/api/chat" } }));
      await context.route("https://sff-chat.test/api/chat", async route => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type" } });
        requests.push(route.request().postDataJSON());
        await route.fulfill({ headers: { "access-control-allow-origin": "*" }, json: { text: "大潮の説明 [1]", kind: "AI相談", searched: true, requestedWeb: true, checkedAt: "2026-11-20T00:00:00Z", segments: [{ text: "**大潮**の説明 <img src=x onerror=alert(1)> [気象庁](https://www.data.jma.go.jp/) " }, { text: "[1]", url: "https://www.data.jma.go.jp/", title: "気象庁" }], sources: [{ url: "https://www.data.jma.go.jp/", title: "気象庁" }] } });
      });
      await reload(); await nav("chat"); await page.waitForFunction(() => !document.querySelector("#chatModeAI").disabled);
      await page.evaluate(() => localStorage.setItem("seabornia-v4-points", JSON.stringify([{ id: "private-test", name: "PRIVATE_SENTINEL_DO_NOT_TRANSMIT", lat: 35.16, lng: 139.6 }])));
      await page.locator("#chatMode").selectOption("ai"); await page.locator("#chatConnection summary").click(); await page.locator("#chatToken").fill("synthetic-access-code-for-browser-test");
      await ask("大潮とは？"); await ask("小潮との違いも教えて");
      assert.deepEqual(Object.keys(requests[0]).sort(), ["history", "marinaId", "question", "web"]);
      assert.equal(requests[0].marinaId, "J14-0170"); assert.equal(requests[1].history.length, 2);
      assert.ok(!JSON.stringify(requests).includes("PRIVATE_SENTINEL"));
      assert.equal(await page.locator(".chatAssistant .chatText a").first().getAttribute("href"), "https://www.data.jma.go.jp/");
      assert.equal(await page.locator(".chatAssistant .chatText strong").first().innerText(), "大潮");
      assert.equal(await page.locator("#chatTranscript img").count(), 0);
      assert.match(await page.locator(".chatMeta").last().innerText(), /ウェブ検索を実行/);
      assert.ok(!await page.evaluate(() => Object.values(localStorage).some(v => v.includes("synthetic-access-code"))));
      await page.screenshot({ path: path.join(out, engine + "-ai-fixture.png"), fullPage: true });
    });
    await check("AI errors stay errors, cancellation recovers, reload clears in-memory history", async () => {
      await context.unroute("https://sff-chat.test/api/chat");
      await context.route("https://sff-chat.test/api/chat", route => route.fulfill({ status: 429, headers: { "access-control-allow-origin": "*" }, json: { error: "テスト用の利用上限" } }));
      await ask("次の質問"); assert.match(await page.locator(".chatAssistant").last().innerText(), /利用上限/);
      await context.unroute("https://sff-chat.test/api/chat");
      await context.route("https://sff-chat.test/api/chat", () => {});
      await page.locator("#chatQuestion").fill("中止する質問"); await page.locator("#chatSend").click(); await page.locator("#chatCancel").click();
      await page.waitForFunction(() => !document.querySelector("#chatSend").disabled); assert.match(await page.locator(".chatAssistant").last().innerText(), /中止/);
      await reload(); await nav("chat"); assert.equal(await page.locator(".chatMessage").count(), 0); assert.equal(await page.locator("#chatToken").inputValue(), "");
    });
    await check("owner code persists only when selected and can be removed", async () => {
      await page.locator("#chatConnection summary").click();
      await page.locator("#chatToken").fill("synthetic-remembered-access-code");
      await page.locator("#chatRemember").check();
      await reload(); await nav("chat");
      assert.equal(await page.locator("#chatToken").inputValue(), "synthetic-remembered-access-code");
      assert.equal(await page.locator(".chatMessage").count(), 0);
      await page.locator("#chatConnection summary").click(); await page.locator("#chatRemember").uncheck();
      await reload(); await nav("chat");
      assert.equal(await page.locator("#chatToken").inputValue(), "");
    });
    await fs.writeFile(path.join(out, engine + "-runtime-errors.json"), JSON.stringify(errors, null, 2));
    assert.deepEqual(errors, []);
  } finally { await context.close(); await browser.close(); }
}
(async () => { await fs.mkdir(out, { recursive: true }); try { for (const engine of ["chromium", "webkit"]) await run(engine); } finally { await fs.writeFile(path.join(out, "chat-results.json"), JSON.stringify(results, null, 2)); } })().catch(error => { console.error(error); process.exitCode = 1; });
