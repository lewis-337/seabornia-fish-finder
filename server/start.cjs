const http = require("node:http");
const { createHandler } = require("./chat-service.cjs");
const handler = createHandler();
const port = Number(process.env.PORT || 8787);
http.createServer((req, res) => {
  if (req.url !== "/api/chat") { res.statusCode = 404; return res.end(); }
  handler(req, res);
}).listen(port, "127.0.0.1", () => console.log("SFF chat backend listening on localhost:" + port));
