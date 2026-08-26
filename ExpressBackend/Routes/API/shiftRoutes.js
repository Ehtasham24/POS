const express = require("express");
const routes = express.Router();
const {
  OpenShift,
  GetCurrentShift,
  CloseShift,
  RecordCashMovement,
  ListShifts,
  GetShiftDetail,
  ReconcileShift,
} = require("../../Controller/shiftController");
const requireAuth = require("../../Middleware/requireAuth");
const requireFeature = require("../../Middleware/requireFeature");

// requireAuth only (no requireOwner) on every route here — self-vs-owner scoping (a cashier
// can only act on/see their own shift, an owner can act on/see any) is enforced inside
// shiftService.js itself, the same division of responsibility bankPaymentRoutes.js already
// uses for "any staff can confirm a payment, but which ones they can see is a service-layer
// concern." requireFeature("shifts") gates the whole file — shift/cash-drawer reconciliation
// is Advanced-tier only, no partial access to any route here at a lower tier.
routes.post("/api/shifts", requireAuth, requireFeature("shifts"), OpenShift);
routes.get("/api/shifts/current", requireAuth, requireFeature("shifts"), GetCurrentShift);
routes.get("/api/shifts", requireAuth, requireFeature("shifts"), ListShifts);
routes.get("/api/shifts/:id", requireAuth, requireFeature("shifts"), GetShiftDetail);
routes.patch("/api/shifts/:id/close", requireAuth, requireFeature("shifts"), CloseShift);
routes.patch("/api/shifts/:id/reconcile", requireAuth, requireFeature("shifts"), ReconcileShift);
routes.post("/api/shifts/:id/cash-movement", requireAuth, requireFeature("shifts"), RecordCashMovement);

module.exports = routes;
