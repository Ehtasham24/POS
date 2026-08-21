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

// All any-staff (requireAuth only, no requireOwner) — per the owner's own call: confirming
// a bank transfer was actually received carries the same trust level as refundSale already
// does (any logged-in staff can refund), not the tighter Owner-only gate void/inventory use.
// Applied per-route, not router-wide — see usersRoutes.js's comment for why a router-level
// routes.use(requireAuth) would incorrectly fire for any request merely routed through this
// same Express Router mount, not just paths declared here.
routes.post("/api/bank-payments/intents", requireAuth, CreateBankPaymentIntent);
routes.get("/api/bank-payments/intents/:id", requireAuth, GetBankPaymentIntent);
routes.get("/api/bank-payments/intents", requireAuth, ListBankPaymentIntents);
routes.patch("/api/bank-payments/intents/:id/confirm", requireAuth, ConfirmBankPaymentIntent);
routes.patch("/api/bank-payments/intents/:id/cancel", requireAuth, CancelBankPaymentIntent);
routes.patch("/api/bank-payments/intents/:id/requeue", requireAuth, RequeueBankPaymentIntent);

module.exports = routes;
