const express = require("express");
const routes = express.Router();
const { GetStorageStatus } = require("../../Controller/shopStatusController");
const requireAuth = require("../../Middleware/requireAuth");

// requireAuth only — no requireOwner, no requireFeature. Every logged-in shop user
// (owner or cashier) should see the same storage warning; it isn't a permissions or
// tier concept, it's "is this shop, as a whole, near what the platform allotted it."
routes.get("/api/shop/storage-status", requireAuth, GetStorageStatus);

module.exports = routes;
