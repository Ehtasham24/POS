const express = require("express");
const routes = express.Router();
const {
  InitiateJazzCashPayment,
  JazzCashCallback,
  InitiateEasypaisaPayment,
  EasypaisaCallback,
} = require("../../Controller/paymentGatewayController");
const requireAuth = require("../../Middleware/requireAuth");

// initiate: any logged-in staff, same trust level as CreateBankPaymentIntent
// (bankPaymentRoutes.js) — starting a payment isn't the sensitive step, confirming one is.
routes.post("/api/payment-gateway/jazzcash/initiate", requireAuth, InitiateJazzCashPayment);
routes.post("/api/payment-gateway/easypaisa/initiate", requireAuth, InitiateEasypaisaPayment);

// callback: called by the gateway's own server, not a staff browser — public, same as
// paymentNotificationRoutes.js's webhook routes, but verified via each gateway's own
// cryptographic signature (jazzCashService.verifyCallback) instead of a shared secret.
routes.post("/api/payment-gateway/jazzcash/callback", JazzCashCallback);
routes.post("/api/payment-gateway/easypaisa/callback", EasypaisaCallback);

module.exports = routes;
