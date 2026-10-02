const { registerDevice, listDevices, setDeviceStatus } = require("../Sevices/deviceService");
const { startSnapshot, snapshotPage, pullChanges, pushEvents, recordDeviceContact } = require("../Sevices/syncService");
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

// A device's sync calls (phase 3). Each is recorded against the device — success or not — so the
// owner's Devices list and the admin console can tell how current every register is.
const withContactRecord = (direction, handler) =>
  asyncHandler(async (req, res) => {
    const started = Date.now();
    const report = req.body?.report || req.query;
    try {
      const { result, rows } = await handler(req);
      await recordDeviceContact(req.device, { direction, rows, durationMs: Date.now() - started, ok: true, report });
      res.send({ ...result, serverTime: new Date().toISOString() });
    } catch (err) {
      await recordDeviceContact(req.device, {
        direction,
        rows: 0,
        durationMs: Date.now() - started,
        ok: false,
        error: err.message,
        report,
      }).catch(() => {});
      throw err;
    }
  });

const PushChanges = withContactRecord("push", async (req) => {
  const events = req.body?.events;
  const result = await pushEvents(req.device, events);
  return { result, rows: Array.isArray(events) ? events.length : 0 };
});

const PullChanges = withContactRecord("pull", async (req) => {
  const { after, upTo, afterId } = req.query;
  const result = await pullChanges(req.device.shop_id, { after, upTo, afterId });
  return { result, rows: result.changes.length };
});

module.exports = { RegisterDevice, ListDevices, UpdateDeviceStatus, StartSnapshot, SnapshotPage, PushChanges, PullChanges };
