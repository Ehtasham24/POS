const { registerDevice, listDevices, setDeviceStatus } = require("../Sevices/deviceService");
const { startSnapshot, snapshotPage } = require("../Sevices/syncService");
const asyncHandler = require("../utils/asyncHandler");

// The owner, signed in on the device being set up, registers it (device/setup.js does this).
const RegisterDevice = asyncHandler(async (req, res) => {
  const { deviceId, name, platform, appVersion } = req.body;
  res.status(201).send(await registerDevice({ deviceId, name, platform, appVersion }, req.user));
});

const ListDevices = asyncHandler(async (req, res) => {
  res.send({ devices: await listDevices(req.user.shopId) });
});

const UpdateDeviceStatus = asyncHandler(async (req, res) => {
  res.send(await setDeviceStatus(req.user.shopId, req.params.id, req.body?.status));
});

// Called by the device itself (requireDevice), for its first download.
const StartSnapshot = asyncHandler(async (req, res) => {
  res.send({ device: { id: req.device.id, receiptPrefix: req.device.receipt_prefix }, ...(await startSnapshot(req.device.shop_id)) });
});

const SnapshotPage = asyncHandler(async (req, res) => {
  const { since, afterId, limit } = req.query;
  res.send(await snapshotPage(req.device.shop_id, req.params.table, { since, afterId, limit }));
});

module.exports = { RegisterDevice, ListDevices, UpdateDeviceStatus, StartSnapshot, SnapshotPage };
