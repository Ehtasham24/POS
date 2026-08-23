const express = require("express");
const routes = express.Router();
const {
  OpenShift,
  GetCurrentShift,
  CloseShift,
  RecordCashMovement,
  ListShifts,
  GetShiftDetail,
} = require("../../Controller/shiftController");
const requireAuth = require("../../Middleware/requireAuth");

// requireAuth only (no requireOwner) on every route here — self-vs-owner scoping (a cashier
// can only act on/see their own shift, an owner can act on/see any) is enforced inside
// shiftService.js itself, the same division of responsibility bankPaymentRoutes.js already
// uses for "any staff can confirm a payment, but which ones they can see is a service-layer
// concern."
routes.post("/api/shifts", requireAuth, OpenShift);
routes.get("/api/shifts/current", requireAuth, GetCurrentShift);
routes.get("/api/shifts", requireAuth, ListShifts);
routes.get("/api/shifts/:id", requireAuth, GetShiftDetail);
routes.patch("/api/shifts/:id/close", requireAuth, CloseShift);
routes.post("/api/shifts/:id/cash-movement", requireAuth, RecordCashMovement);

module.exports = routes;
