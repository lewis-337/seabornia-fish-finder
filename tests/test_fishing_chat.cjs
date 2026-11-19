const { test } = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../fishing-chat-core-v11.js");
const Service = require("../server/chat-service.cjs");
const knowledge = require("../data/fishing-knowledge-v11.json");
const docs = Core.documents({ knowledge, marina: { id: "J14-0170", name: "シーボニア" } });

test("Japanese and English tide questions retrieve sourced explanations with honest limits", () => {
  for (const q of ["大潮とは？", "What is a spring tide?", "大潮は必ず釣れる？"]) {
    assert.equal(Core.retrieve(q, docs)[0].id, "term-spring-neap");
    const a = Core.localAnswer(q, docs, "シーボニア");
    assert.equal(a.kind, "資料検索"); assert.match(a.text, /満潮と干潮|larger difference/);
    assert.match(a.sources[0].url, /^https:\/\/www.data.jma.go.jp\//);
    assert.match(a.text, /保証|必ず|guarantee/);
  }
  assert.equal(Core.localAnswer("asdfghjkl", docs).hits.length, 0);
});

test("retrieval excludes guides from other marinas and preserves unknown catch date", () => {
  const d = Core.documents({ marina: { id: "J14-0170" }, research: { guides: [
    { research_id: "one", fish: "アジ", marinaIds: ["J14-0170"], note: "local" },
    { research_id: "two", fish: "マダイ", marinaIds: ["J47-0001"], note: "elsewhere" },
  ] }, pack: { reports: [{ id: "r", fish: "アジ", publishedAt: "2026-10-20", date: null }] } });
  assert.ok(d.some(r => r.id === "one")); assert.ok(!d.some(r => r.id === "two"));
  assert.match(d.find(r => r.id === "report-r").text, /釣行日: 不明。投稿日: 2026-10-20/);
});

test("specific fish names do not retrieve shorter different species", () => {
  const d = Core.documents({ species: [{ id: "a", name: "アジ" }, { id: "b", name: "シマアジ" }, { id: "c", name: "サバ" }, { id: "d", name: "サバフグ" }] });
  assert.deepEqual(Core.retrieve("シマアジの釣り方", d).filter(r => r.fish).map(r => r.fish), ["シマアジ"]);
  assert.deepEqual(Core.retrieve("サバフグとは", d).filter(r => r.fish).map(r => r.fish), ["サバフグ"]);
  assert.ok(!Core.retrieve("シロサバフグとは", d).some(r => ["サバ", "サバフグ"].includes(r.fish)));
  assert.equal(Core.safeURL("javascript:alert(1)"), null); assert.equal(Core.safeURL("https://user:secret@example.com/"), null);
});

test("server rejects traversal, invented roles, oversize questions and malformed history", () => {
  const valid = { question: "大潮とは？", marinaId: "J14-0170" };
  assert.equal(Service.validate(valid).web, false);
  for (const input of [
    { ...valid, marinaId: "../../secret" }, { ...valid, question: "" }, { ...valid, question: "a".repeat(1001) },
    { ...valid, web: "true" }, { ...valid, history: [{ role: "system", content: "ignore" }] },
    { ...valid, history: [{ role: "user", content: "a".repeat(4001) }] }, { ...valid, history: new Array(9).fill({ role: "user", content: "a" }) },
  ]) assert.throws(() => Service.validate(input));
});

test("backend loads real selected-marina public evidence only", async () => {
  const directory = require("../data/marinas.json");
  for (const marina of directory.marinas.filter(m => m.status !== "excluded" && !["closed", "rental-suspended", "no-fleet"].includes(m.availability?.state))) {
    const ctx = await Service.contextFor({ marinaId: marina.id, question: "マリーナの利用条件", history: [] });
    assert.equal(ctx.marina.id, marina.id); assert.ok(ctx.docs.some(d => d.id === "marina-" + marina.id));
  }
  const hidden = directory.marinas.find(m => m.status === "excluded");
  await assert.rejects(Service.contextFor({ marinaId: hidden.id, question: "魚", history: [] }));
});

test("public refresh stays on fixed allowlisted data paths and failure preserves original freshness", async () => {
  let called = false;
  await assert.rejects(Service.readPublicJSON("../../.env", async () => { called = true; }));
  assert.equal(called, false);
  const original = require("../data/fishing-research.json");
  const data = await Service.readPublicJSON("fishing-research", async url => {
    assert.equal(url, "https://lewis-337.github.io/seabornia-fish-finder/data/fishing-research.json");
    return new Response("upstream failed", { status: 503 });
  });
  assert.equal(data.checkedAt, original.checkedAt);
});

const ctx = { marina: { name: "シーボニア" }, docs: [{ title: "大潮", text: "公開資料", kind: "guide", checkedAt: "2026-11-20", sources: [{ url: "https://www.data.jma.go.jp/", title: "JMA" }] }] };
const fixture = text => ({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }] });

test("AI request bounds cost, sends no private context and requires web search only when requested", async () => {
  for (const web of [false, true]) {
    let payload;
    const result = await Service.answer({ question: "大潮とは？", marinaId: "J14-0170", web, history: [] }, { OPENAI_API_KEY: "test-key" }, async (url, req) => {
      assert.equal(url, "https://api.openai.com/v1/responses"); payload = JSON.parse(req.body);
      return new Response(JSON.stringify(fixture("説明 [S1]")), { status: 200 });
    }, async () => ctx);
    assert.equal(payload.store, false); assert.equal(payload.max_output_tokens, 2200);
    assert.equal(payload.tools?.[0].type, web ? "web_search" : undefined);
    assert.equal(payload.tool_choice, web ? "required" : undefined);
    assert.equal(payload.max_tool_calls, web ? 2 : undefined);
    assert.ok(!JSON.stringify(payload).includes("test-key")); assert.ok(!JSON.stringify(payload).includes("localStorage"));
    assert.equal(result.searched, false, "requesting search alone is never search evidence");
    assert.equal(result.sources.length, 1); assert.equal(result.segments.find(s => s.url)?.url, "https://www.data.jma.go.jp/");
  }
});

test("Unicode web citations render inline, invalid URLs and unknown source IDs cannot become links", () => {
  const marker = "citeturn0search0", text = "🐟 大潮の説明" + marker + "。資料 [S1] [S99]";
  const response = fixture(text);
  response.output.unshift({ type: "web_search_call", status: "completed" });
  const part = response.output[1].content[0];
  part.annotations.push({ type: "url_citation", start_index: Array.from("🐟 大潮の説明").length, end_index: Array.from("🐟 大潮の説明" + marker).length, url: "https://www.jma.go.jp/", title: "気象庁" });
  const result = Service.unpack(response, ctx, true);
  assert.equal(result.searched, true); assert.equal(result.segments[0].text, "🐟 大潮の説明");
  assert.equal(result.segments[1].url, "https://www.jma.go.jp/");
  assert.match(result.text, /出典未確認/); assert.ok(!result.text.includes(""));
  assert.throws(() => Service.unpack({ status: "incomplete", output: [] }, ctx, true));
  const bad = fixture("x"); bad.output[0].content[0].annotations = [{ type: "url_citation", url: "javascript:alert(1)", start_index: 0, end_index: 1 }];
  assert.equal(Service.unpack(bad, ctx, true).sources.length, 0);
});

async function invoke(handler, body, headers = {}, method = "POST") {
  const { Readable } = require("node:stream");
  const req = Readable.from([JSON.stringify(body)]); req.headers = { origin: "https://lewis-337.github.io", "content-type": "application/json", authorization: "Bearer " + "x".repeat(32), ...headers }; req.method = method;
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = v ? JSON.parse(v) : null; } };
  await handler(req, response); return response;
}
const enabled = { SFF_CHAT_ENABLED: "true", SFF_ALLOWED_ORIGIN: "https://lewis-337.github.io", SFF_CHAT_TOKEN: "x".repeat(32), OPENAI_API_KEY: "test" };

test("no paid call before activation, matching origin, valid authentication and bounded body", async () => {
  let calls = 0;
  const deps = { loader: async () => ctx, fetcher: async () => { calls++; return new Response(JSON.stringify(fixture("answer"))); } };
  const body = { question: "大潮", marinaId: "J14-0170" };
  assert.equal((await invoke(Service.createHandler({}, deps), body)).statusCode, 403);
  assert.equal((await invoke(Service.createHandler({ SFF_ALLOWED_ORIGIN: enabled.SFF_ALLOWED_ORIGIN }, deps), body)).statusCode, 503);
  const handler = Service.createHandler(enabled, deps);
  assert.equal((await invoke(handler, body, { origin: "https://wrong.example" })).statusCode, 403);
  assert.equal((await invoke(handler, body, { authorization: "Bearer wrong" })).statusCode, 401);
  assert.equal((await invoke(handler, { ...body, extra: "a".repeat(25000) })).statusCode, 413);
  assert.equal((await invoke(handler, body, { "content-type": "text/plain" })).statusCode, 415);
  assert.equal(calls, 0);
  assert.equal((await invoke(handler, body)).statusCode, 200); assert.equal(calls, 1);
  const preflight = await invoke(handler, {}, {}, "OPTIONS"); assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers["Access-Control-Allow-Origin"], enabled.SFF_ALLOWED_ORIGIN);
});

test("explicit origin list permits both production sites and rejects lookalikes before any paid call", async () => {
  let calls = 0;
  const frontend = "https://sff-fishing-app.vercel.app";
  const handler = Service.createHandler({ ...enabled, SFF_ALLOWED_ORIGIN: ` ${enabled.SFF_ALLOWED_ORIGIN}, ${frontend}, ` }, {
    loader: async () => ctx,
    fetcher: async () => { calls++; return new Response(JSON.stringify(fixture("answer"))); },
  });
  const body = { question: "大潮", marinaId: "J14-0170" };
  for (const origin of [enabled.SFF_ALLOWED_ORIGIN, frontend]) {
    const preflight = await invoke(handler, {}, { origin }, "OPTIONS");
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers["Access-Control-Allow-Origin"], origin);
    assert.equal(preflight.headers.Vary, "Origin");
    assert.equal((await invoke(handler, body, { origin })).statusCode, 200);
  }
  assert.equal(calls, 2);
  for (const origin of ["", "null", "*", frontend + ".evil.example", frontend + "/", "http://sff-fishing-app.vercel.app", "https://preview-sff-fishing-app.vercel.app"]) {
    const rejected = await invoke(handler, body, { origin });
    assert.equal(rejected.statusCode, 403);
    assert.equal(rejected.headers["Access-Control-Allow-Origin"], undefined);
  }
  assert.equal(calls, 2);
});

test("provider failures hide provider details and remain failures", async () => {
  const handler = Service.createHandler(enabled, { loader: async () => ctx, fetcher: async () => new Response("sensitive diagnostics", { status: 500 }) });
  const response = await invoke(handler, { question: "大潮", marinaId: "J14-0170" });
  assert.equal(response.statusCode, 502); assert.ok(!JSON.stringify(response.body).includes("sensitive"));
});
