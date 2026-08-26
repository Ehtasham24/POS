const express = require("express");
const routes = express.Router();
const {
  CreateBankPaymentIntent,
  GetBankPaymentIntent,
  ListBankPaymentIntents,
  ConfirmBankPaymentIntent,
  CancelBankPaymentIntent,
  RequeueBankPaymentIntent,
} = require("../../Controller/bankPaymentController");
const requireAuth = require("../../Middleware/requireAuth");
const requireFeature = require("../../Middleware/requireFeature");

// All any-staff (requireAuth only, no requireOwner) — per the owner's own call: confirming
// a bank transfer was actually received carries the same trust level as refundSale already
// does (any logged-in staff can refund), not the tighter Owner-only gate void/inventory use.
// Applied per-route, not router-wide — see usersRoutes.js's comment for why a router-level
// routes.use(requireAuth) would incorrectly fire for any request merely routed through this
// same Express Router mount, not just paths declared here. Smart-tier+.
routes.post("/api/bank-payments/intents", requireAuth, requireFeature("bankTransfer"), CreateBankPaymentIntent);
routes.get("/api/bank-payments/intents/:id", requireAuth, requireFeature("bankTransfer"), GetBankPaymentIntent);
routes.get("/api/bank-payments/intents", requireAuth, requireFeature("bankTransfer"), ListBankPaymentIntents);
routes.patch("/api/bank-payments/intents/:id/confirm", requireAuth, requireFeature("bankTransfer"), ConfirmBankPaymentIntent);
routes.patch("/api/bank-payments/intents/:id/cancel", requireAuth, requireFeature("bankTransfer"), CancelBankPaymentIntent);
routes.patch("/api/bank-payments/intents/:id/requeue", requireAuth, requireFeature("bankTransfer"), RequeueBankPaymentIntent);

module.exports = routes;
