const express = require("express");
const routes = express.Router();
const { GetInventory } = require("../../Controller/inventoryController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");

// Applied per-route (see usersRoutes.js's comment for why routes.use(...) here would
// have been wrong). Inventory is Owner-only in full.
routes.get("/api/inventory", requireAuth, requireOwner, GetInventory);

module.exports = routes;
