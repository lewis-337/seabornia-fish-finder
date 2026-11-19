const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createGateway } = require("../server/owner-chat-gateway.cjs");
const env = { SFF_OWNER_SESSION_ENABLED: "true", VERCEL_PROJECT_ID: "prj_vf9sjVFYlWLg26HJWMnAz5i6tKue", SFF_CHAT_TOKEN: "owner-test-".repeat(5) };
const origin = "https://sff-fishing-app.vercel.app";
async function invoke(handler, { body = { question: "大潮", marinaId: "J14-0170" }, raw, headers = {}, method = "POST" } = {}) {
  const req = Readable.from([raw === undefined ? JSON.stringify(body) : raw]);
  req.headers = { origin, "content-type": "application/json", ...headers }; req.method = method;
  const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, end(value) { this.body = JSON.parse(value); } };
  await handler(req,res); return res;
}
test("owner gateway fails closed outside its protected project and rejects cross-origin, method and malformed requests", async () => {
  let calls = 0; const fetcher = async () => { calls++; throw Error("must not run"); };
  for (const options of [{}, { ...env, SFF_OWNER_SESSION_ENABLED: "false" }, { ...env, VERCEL_PROJECT_ID: "another-project" }, { ...env, SFF_CHAT_TOKEN: "short" }]) {
    assert.equal((await invoke(createGateway(options,fetcher))).statusCode,503);
  }
  const handler = createGateway(env,fetcher);
  for (const bad of ["", "null", origin + ".evil.example"]) assert.equal((await invoke(handler,{headers:{origin:bad}})).statusCode,403);
  assert.equal((await invoke(handler,{method:"GET"})).statusCode,405);
  assert.equal((await invoke(handler,{headers:{"content-type":"text/plain"}})).statusCode,415);
  assert.equal((await invoke(handler,{raw:"{"})).statusCode,400);
  assert.equal((await invoke(handler,{raw:"a".repeat(24001)})).statusCode,413);
  assert.equal(calls,0);
});
test("owner gateway uses server-held access, never forwards visitor cookies or arbitrary destinations", async () => {
  const expected = { text:"answer",segments:[{text:"answer"}],kind:"AI相談" };
  const handler = createGateway(env,async (url,options) => {
    assert.equal(url,"https://sff-fishing-chat-api.vercel.app/api/chat");
    assert.equal(options.redirect,"error");
    assert.deepEqual(options.headers,{Origin:origin,"Content-Type":"application/json",Authorization:"Bearer " + env.SFF_CHAT_TOKEN});
    assert.equal(JSON.parse(options.body).question,"大潮");
    return new Response(JSON.stringify(expected));
  });
  const response=await invoke(handler,{headers:{cookie:"private-session",authorization:"Bearer visitor-input"}});
  assert.equal(response.statusCode,200);assert.deepEqual(response.body,expected);
  assert.equal(response.headers["Cache-Control"],"no-store");
  assert.ok(!JSON.stringify(response).includes(env.SFF_CHAT_TOKEN));
  assert.equal((await invoke(handler,{headers:{origin:"https://sff-fishing-app-lewis-337s-projects.vercel.app"}})).statusCode,200);
});
test("owner gateway hides upstream details and preserves bounded rate-limit failure", async () => {
  for (const status of [401,500,429]) {
    const handler=createGateway(env,async()=>new Response(JSON.stringify({error:"private service configuration"}),{status}));
    const response=await invoke(handler);
    assert.equal(response.statusCode,status===429?429:502);
    assert.ok(!JSON.stringify(response).includes("private service configuration"));
  }
});
