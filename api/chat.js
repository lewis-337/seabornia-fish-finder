// Node serverless adapter. Public Pages packaging deliberately excludes this directory.
module.exports = require("../server/chat-service.cjs").createHandler();
