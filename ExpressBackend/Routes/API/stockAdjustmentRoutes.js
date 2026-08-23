const express = require("express");
const routes = express.Router();
const {
  CreateStockAdjustment,
  ListStockAdjustments,
  GetShrinkageSummary,
} = require("../../Controller/stockAdjustmentController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");

// Owner-only throughout — matches every other Inventory-writing route (inventoryRoutes.js,
// productsRoutes.js's lot/quantity routes), zero new exposure beyond what Inventory already is.
routes.post("/api/stock-adjustments", requireAuth, requireOwner, CreateStockAdjustment);
routes.get("/api/stock-adjustments", requireAuth, requireOwner, ListStockAdjustments);
routes.get("/api/stock-adjustments/summary", requireAuth, requireOwner, GetShrinkageSummary);

module.exports = routes;
