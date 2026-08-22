const express = require("express");
const routes = express.Router();
const {
  CheckoutSales,
  getSales,
  getSalesByProfitLoss,
  getSalesTimeSeries,
  getPaymentMediumTotals,
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
//
// The old standalone POST /sales (one independent request per cart item, no
// sale_transactions/payment_method concept at all) is gone — checkoutSale/CheckoutSales
// fully replaced it and is the only path that ever creates a sale now.
routes.get("/api/getsales", requireAuth, getRecentSale);
routes.get("/api/BilledHistory", requireAuth, getBilledHistory);
routes.post("/api/sales/checkout", requireAuth, CheckoutSales);
routes.patch("/api/sales/:id/void", requireAuth, voidSaleController);
routes.post("/api/sales/:id/refunds", requireAuth, refundSaleController);
routes.post("/api/Sales", requireAuth, requireOwner, getSales);
routes.post("/api/Sales/filter", requireAuth, requireOwner, getSalesByProfitLoss);
routes.post("/api/Sales/timeseries", requireAuth, requireOwner, getSalesTimeSeries);
// Any staff, not Owner-only — unlike the profit/COGS-revealing endpoints above, this is
// just revenue-by-medium (no buying_price/profit anywhere in it), and the Payment Mediums
// page that primarily uses it is itself any-staff (same trust level as refunds/bank-
// payment confirm — see navItems.js's comment on that page).
routes.post("/api/Sales/payment-medium-totals", requireAuth, getPaymentMediumTotals);

module.exports = routes;
