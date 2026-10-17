const { registerDevice, listDevices, setDeviceStatus, listRejections, resolveRejection } = require("../Sevices/deviceService");
const { startSnapshot, snapshotPage, pullChanges, pushEvents, recordDeviceContact, recordDeviceActivity } = require("../Sevices/syncService");
const { announcementsStamp } = require("../Sevices/announcementService");
const asyncHandler = require("../utils/asyncHandler");
const { pool } = require("../Db");

// The owner, signed in on the device being set up, registers it (device/setup.js does this).
const RegisterDevice = asyncHandler(async (req, res) => {
  const { deviceId, name, platform, appVersion } = req.body;
  res.status(201).send(await registerDevice({ deviceId, name, platform, appVersion }, req.user));
});

const ListDevices = asyncHandler(async (req, res) => {
  const [devices, shop] = await Promise.all([
    listDevices(req.user.shopId),
    pool.query(`SELECT max_devices FROM shops WHERE id = $1`, [req.user.shopId]),
  ]);
  res.send({ devices, limit: shop.rows[0].max_devices });
});

const UpdateDeviceStatus = asyncHandler(async (req, res) => {
  res.send(await setDeviceStatus(req.user.shopId, req.params.id, req.body?.status));
});

const ListRejections = asyncHandler(async (req, res) => {
  res.send({ rejections: await listRejections(req.user.shopId, { includeResolved: req.query.all === "1" }) });
});

const ResolveRejection = asyncHandler(async (req, res) => {
  res.send(await resolveRejection(req.user.shopId, Number(req.params.id), req.user.id));
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
      // Who used the register (the admin panel's "Last active"), with a call that worked: the
      // device clears what it sent once the call succeeds. Monitoring only — never fails the sync.
      if (report.activity) await recordDeviceActivity(req.device, report.activity).catch((err) => console.error("Device activity write failed:", err.message));
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

// The last page of a pull also says what the shop's announcements look like now (a stamp), so
// the register shows a new one while it's in use rather than at its next 10-minute check.
const PullChanges = withContactRecord("pull", async (req) => {
  const { after, upTo, afterId } = req.query;
  const result = await pullChanges(req.device.shop_id, { after, upTo, afterId });
  if (result.done) result.noticesStamp = await announcementsStamp(req.shop.id, req.shop.tier);
  return { result, rows: result.changes.length };
});

module.exports = { RegisterDevice, ListDevices, UpdateDeviceStatus, ListRejections, ResolveRejection, StartSnapshot, SnapshotPage, PushChanges, PullChanges };
