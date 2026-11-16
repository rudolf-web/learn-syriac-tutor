// Vercel serverless entry point — reuses the same Express app as server.js.
// All requests are rewritten here by vercel.json.
const app = require("../server");

module.exports = app;
