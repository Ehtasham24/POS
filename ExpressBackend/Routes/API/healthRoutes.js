const express = require("express");
const routes = express.Router();

// Public, unauthenticated — this is what offline/connectivity.js pings to detect
// reachability (used to be /categories, which is fine right up until that route
// requires a login: pinging it while logged out would misreport "offline" instead of
// "not authenticated"). A health check shouldn't double as an auth gate.
routes.get("/api/health", (req, res) => res.send({ status: "ok" }));

module.exports = routes;
