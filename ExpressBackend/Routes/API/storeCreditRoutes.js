const express = require("express");
const routes = express.Router();
const { lookupVoucher, getVouchers, getHistory } = require("../../Controller/storeCreditController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");
const requireFeature = require("../../Middleware/requireFeature");

// Applied per-route (see usersRoutes.js's comment for why routes.use(...) here would have
// been wrong). Voucher lookup by code is any logged-in staff (checkout needs it); the full
// voucher list/history is Owner-only, mirroring Credit/Debit's gating. Smart-tier+.
routes.get("/api/store-credit/lookup/:code", requireAuth, requireFeature("storeCredit"), lookupVoucher);
routes.get("/api/store-credit/vouchers", requireAuth, requireOwner, requireFeature("storeCredit"), getVouchers);
routes.get("/api/store-credit/vouchers/:refundId/history", requireAuth, requireOwner, requireFeature("storeCredit"), getHistory);

module.exports = routes;
