const express = require("express");
const routes = express.Router();
const {
  CreateStockAdjustment,
  ListStockAdjustments,
  GetShrinkageSummary,
} = require("../../Controller/stockAdjustmentController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");
const requireFeature = require("../../Middleware/requireFeature");

// Owner-only throughout — matches every other Inventory-writing route (inventoryRoutes.js,
// productsRoutes.js's lot/quantity routes), zero new exposure beyond what Inventory already is.
// Stock Adjustments itself is Smart-tier+ (createAdjustment/listAdjustments); the shrinkage
// cost-analysis summary is its own, higher Advanced-tier gate — a Smart shop can log
// adjustments but doesn't get the aggregated cost-impact report on top of them.
routes.post("/api/stock-adjustments", requireAuth, requireOwner, requireFeature("stockAdjustments"), CreateStockAdjustment);
routes.get("/api/stock-adjustments", requireAuth, requireOwner, requireFeature("stockAdjustments"), ListStockAdjustments);
routes.get("/api/stock-adjustments/summary", requireAuth, requireOwner, requireFeature("shrinkageReport"), GetShrinkageSummary);

module.exports = routes;
