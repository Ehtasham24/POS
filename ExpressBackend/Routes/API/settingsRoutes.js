const express = require("express");
const routes = express.Router();
const { GetSettings, UpdateSettings } = require("../../Controller/settingsController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");

// Applied per-route (see usersRoutes.js's comment for why routes.use(requireAuth) here
// would have been wrong). Reads — company name/logo/receipt terms — any logged-in user
// (a Cashier's printed receipt needs the same company header). Changing settings is
// Owner-only.
routes.get("/api/settings", requireAuth, GetSettings);
routes.put("/api/settings", requireAuth, requireOwner, UpdateSettings);

module.exports = routes;
