const express = require("express");
const routes = express.Router();
const {
  PostSales,
  CheckoutSales,
  getSales,
  getSalesByProfitLoss,
  getSalesTimeSeries,
  getRecentSale,
  getBilledHistory,
  voidSaleController,
  refundSaleController,
} = require("../../Controller/salesController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");

// Applied per-route (see usersRoutes.js's comment for why routes.use(requireAuth) here
// would have been wrong). Checkout, own-history, void, and refund — any logged-in user
// (Cashier included). Sales Report's revenue/profit endpoints (/api/Sales*) are Owner-only;
// voidSale's own logic (not this router) enforces the finer "own sale, same day" rule for
// non-owners, while refundSale deliberately has no such restriction (see its comment).
routes.get("/api/getsales", requireAuth, getRecentSale);
routes.get("/api/BilledHistory", requireAuth, getBilledHistory);
routes.post("/sales", requireAuth, PostSales);
routes.post("/api/sales/checkout", requireAuth, CheckoutSales);
routes.patch("/api/sales/:id/void", requireAuth, voidSaleController);
routes.post("/api/sales/:id/refunds", requireAuth, refundSaleController);
routes.post("/api/Sales", requireAuth, requireOwner, getSales);
routes.post("/api/Sales/filter", requireAuth, requireOwner, getSalesByProfitLoss);
routes.post("/api/Sales/timeseries", requireAuth, requireOwner, getSalesTimeSeries);

module.exports = routes;
