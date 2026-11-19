// Only deploy to the owner frontend project with Vercel Authentication set to ALL deployments.
// Authentication happens at Vercel's edge before this function runs. Never make this gateway public.
const ORIGIN = "https://sff-fishing-app.vercel.app";
const PHONE_ORIGIN = "https://sff-fishing-app-lewis-337s-projects.vercel.app";
const PROJECT = "prj_vf9sjVFYlWLg26HJWMnAz5i6tKue";
const ENDPOINT = "https://sff-fishing-chat-api.vercel.app/api/chat";
function createGateway(env = process.env, fetcher = fetch) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    if (env.SFF_OWNER_SESSION_ENABLED !== "true" || env.VERCEL_PROJECT_ID !== PROJECT || !env.SFF_CHAT_TOKEN || env.SFF_CHAT_TOKEN.length < 32)
      return send(503, { error: "ログイン接続の準備中です。" });
    if (![ORIGIN, PHONE_ORIGIN].includes(req.headers.origin)) return send(403, { error: "アプリからもう一度お試しください。" });
    if (req.method !== "POST") return send(405, { error: "POSTが必要です。" });
    if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) return send(415, { error: "JSON形式が必要です。" });
    let body;
    try {
      if (req.body && typeof req.body === "object") body = JSON.stringify(req.body);
      else {
        let size = 0, chunks = [];
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 24000) return send(413, { error: "リクエストが大きすぎます。" });
          chunks.push(Buffer.from(chunk));
        }
        body = Buffer.concat(chunks).toString("utf8");
      }
      if (Buffer.byteLength(body) > 24000) return send(413, { error: "リクエストが大きすぎます。" });
      JSON.parse(body);
    } catch { return send(400, { error: "質問の形式を確認してください。" }); }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetcher(ENDPOINT, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { Origin: ORIGIN, "Content-Type": "application/json", Authorization: "Bearer " + env.SFF_CHAT_TOKEN },
        body,
      });
      const result = await response.json();
      if (response.ok && Array.isArray(result.segments) && typeof result.text === "string") return send(200, result);
      // Keep hosting diagnostics, secret configuration and upstream authentication details private.
      return send([400, 413, 415, 429].includes(response.status) ? response.status : 502,
        { error: response.status === 429 ? "少し時間をおいて送信してください。" : "AIに接続できません。資料検索も利用できます。" });
    } catch { return send(502, { error: "AIに接続できません。しばらくして再試行してください。" }); }
    finally { clearTimeout(timer); }
  };
}
module.exports = { createGateway };
