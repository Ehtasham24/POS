const express = require("express");
const routes = express.Router();
const {
  ReceiveNotification,
  ReceiveHeartbeat,
  GetForwarderStatus,
  GetForwarderSecretStatus,
  RegenerateForwarderSecret,
} = require("../../Controller/paymentNotificationController");
const requireForwarderSecret = require("../../Middleware/requireForwarderSecret");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");
const requireFeature = require("../../Middleware/requireFeature");

// Called by the phone forwarder app, not a staff browser — shared-secret gated, not
// session-cookie gated. Mounted early/public in Server.js, same as PayFast's ITN route.
// requireForwarderSecret identifies the shop from its own secret; requireFeature then
// applies the same plan gate every other bank-transfer route has.
//
// Its own router so Server.js's plain-HTTP LAN listener (port 4001) can mount ONLY these
// two — never the session-cookie routes below, which must stay HTTPS-only.
const webhookRoutes = express.Router();
webhookRoutes.post(
  "/api/bank-payments/webhook/notification",
  requireForwarderSecret,
  requireFeature("bankTransfer"),
  ReceiveNotification
);
webhookRoutes.post(
  "/api/bank-payments/webhook/heartbeat",
  requireForwarderSecret,
  requireFeature("bankTransfer"),
  ReceiveHeartbeat
);
routes.use(webhookRoutes);

// Staff-facing status readout — normal session auth.
routes.get("/api/bank-payments/webhook/status", requireAuth, requireFeature("bankTransfer"), GetForwarderStatus);

// Owner-only: the shop's forwarder secret. GET only says whether one exists; POST issues a
// new one (shown once) and invalidates the previous one.
routes.get(
  "/api/bank-payments/webhook/secret",
  requireAuth,
  requireOwner,
  requireFeature("bankTransfer"),
  GetForwarderSecretStatus
);
routes.post(
  "/api/bank-payments/webhook/secret",
  requireAuth,
  requireOwner,
  requireFeature("bankTransfer"),
  RegenerateForwarderSecret
);

module.exports = routes;
module.exports.webhookRoutes = webhookRoutes;
