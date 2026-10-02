const express = require("express");
const routes = express.Router();
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");
const requireDevice = require("../../Middleware/requireDevice");
const {
  RegisterDevice,
  ListDevices,
  UpdateDeviceStatus,
  ListRejections,
  ResolveRejection,
  StartSnapshot,
  SnapshotPage,
  PushChanges,
  PullChanges,
} = require("../../Controller/deviceController");

// A shop's own devices (plan-offline-sync.md). Registering, listing and retiring them is the
// owner's, signed in as usual; the sync routes are the device's own, authenticated by its token.
routes.post("/api/devices/register", requireAuth, requireOwner, RegisterDevice);
routes.get("/api/devices", requireAuth, requireOwner, ListDevices);
routes.patch("/api/devices/:id/status", requireAuth, requireOwner, UpdateDeviceStatus);
routes.get("/api/devices/rejections", requireAuth, requireOwner, ListRejections);
routes.patch("/api/devices/rejections/:id/resolve", requireAuth, requireOwner, ResolveRejection);

routes.get("/api/sync/snapshot", requireDevice, StartSnapshot);
routes.get("/api/sync/snapshot/:table", requireDevice, SnapshotPage);
routes.post("/api/sync/push", requireDevice, PushChanges);
routes.get("/api/sync/pull", requireDevice, PullChanges);

module.exports = routes;
