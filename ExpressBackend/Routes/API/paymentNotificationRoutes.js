const express = require("express");
const routes = express.Router();
const {
  ReceiveNotification,
  ReceiveHeartbeat,
  GetForwarderStatus,
} = require("../../Controller/paymentNotificationController");
const requireForwarderSecret = require("../../Middleware/requireForwarderSecret");
const requireAuth = require("../../Middleware/requireAuth");

// Called by the phone forwarder app, not a staff browser — shared-secret gated, not
// session-cookie gated. Mounted early/public in Server.js, same as PayFast's ITN route.
routes.post("/api/bank-payments/webhook/notification", requireForwarderSecret, ReceiveNotification);
routes.post("/api/bank-payments/webhook/heartbeat", requireForwarderSecret, ReceiveHeartbeat);

// Staff-facing status readout — normal session auth.
routes.get("/api/bank-payments/webhook/status", requireAuth, GetForwarderStatus);

module.exports = routes;
