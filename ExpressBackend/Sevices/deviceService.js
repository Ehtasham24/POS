const crypto = require("crypto");
const { pool, systemPool } = require("../Db");
const ApiError = require("../utils/ApiError");

// A shop's registered devices — the Windows PCs and Android phones that run the POS with their
// own local database and sync through the cloud (plan-offline-sync.md). Only the shop's owner
// registers one, within the shop's device limit (shops.max_devices, set by the platform admin).
// A device proves itself afterwards with a token the cloud keeps only a hash of.

const PLATFORMS = { windows: "P", android: "M" }; // receipt prefix letter: P1, P2… / M1, M2…
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const DEVICE_COLUMNS = `id, shop_id, name, platform, receipt_prefix, registered_by, registered_at, app_version,
  last_seen_at, last_push_at, last_pull_at, pending_count, oldest_pending_at, clock_skew_ms, last_error,
  status, status_changed_at`;

// The owner registers this device. The shop row is locked so two registrations at once can't
// both squeeze under the limit or take the same receipt prefix. A prefix is never reused —
// receipts already printed with it stay unique — so the next number is above every one this
// shop has ever had, retired and blocked devices included.
const registerDevice = async ({ deviceId, name, platform, appVersion }, requestingUser) => {
  if (!UUID_PATTERN.test(String(deviceId || ""))) throw new ApiError(400, "Invalid device id");
  if (!PLATFORMS[platform]) throw new ApiError(400, "Platform must be windows or android");
  const deviceName = String(name || "").trim();
  if (!deviceName || deviceName.length > 60) throw new ApiError(400, "Device name is required (up to 60 characters)");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: shopRows } = await client.query(
      `SELECT id, name, tier, is_active, max_devices FROM shops WHERE id = $1 FOR UPDATE`,
      [requestingUser.shopId]
    );
    const shop = shopRows[0];
    if (!shop || !shop.is_active) throw new ApiError(403, "This shop is not active");

    const { rows: existing } = await client.query(`SELECT 1 FROM devices WHERE id = $1`, [deviceId]);
    if (existing.length) throw new ApiError(409, "This device is already registered");

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM devices WHERE shop_id = $1 AND status = 'active'`,
      [shop.id]
    );
    if (countRows[0].n >= shop.max_devices) {
      throw new ApiError(
        403,
        shop.max_devices === 0
          ? "This shop can't register devices yet — contact support"
          : `Device limit reached (${shop.max_devices}) — retire an old device or contact support`
      );
    }

    const letter = PLATFORMS[platform];
    const { rows: prefixRows } = await client.query(
      `SELECT COALESCE(MAX(substring(receipt_prefix FROM 2)::int), 0) + 1 AS next
       FROM devices WHERE shop_id = $1 AND receipt_prefix ~ $2`,
      [shop.id, `^${letter}[0-9]+$`]
    );
    const receiptPrefix = `${letter}${prefixRows[0].next}`;

    const token = crypto.randomBytes(32).toString("base64url");
    const { rows } = await client.query(
      `INSERT INTO devices (id, shop_id, name, platform, receipt_prefix, token_hash, registered_by, app_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${DEVICE_COLUMNS}`,
      [deviceId, shop.id, deviceName, platform, receiptPrefix, hashToken(token), requestingUser.id, appVersion || null]
    );
    await client.query("COMMIT");
    // The token is returned this once and never stored in the clear.
    return { device: rows[0], token, shop: { id: shop.id, name: shop.name, tier: shop.tier } };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// How a device is doing, from what the cloud last heard from it (plan-offline-sync.md):
// in sync / behind / offline long. Derived here, never stored.
const syncState = (device, now = Date.now()) => {
  if (device.status !== "active") return device.status;
  const ago = (value) => (value ? now - new Date(value).getTime() : Infinity);
  if (device.pending_count > 0 && ago(device.last_seen_at) > 24 * 60 * 60 * 1000) return "offline_long";
  if (device.pending_count > 0 || ago(device.last_seen_at) > 60 * 60 * 1000) return "behind";
  return "in_sync";
};

const listDevices = async (shopId) => {
  const { rows } = await pool.query(
    `SELECT ${DEVICE_COLUMNS}, (SELECT display_name FROM users WHERE id = d.registered_by) AS registered_by_name
     FROM devices d WHERE shop_id = $1 ORDER BY registered_at`,
    [shopId]
  );
  return rows.map((row) => ({ ...row, sync_state: syncState(row) }));
};

// Retire (replaced normally) or block (lost or stolen). Either is final: the device's token
// stops working at once; a replacement registers as a new device.
const setDeviceStatus = async (shopId, deviceId, status) => {
  if (!["retired", "blocked"].includes(status)) throw new ApiError(400, "Status must be retired or blocked");
  if (!UUID_PATTERN.test(String(deviceId || ""))) throw new ApiError(404, "Device not found");
  const { rows } = await pool.query(
    `UPDATE devices SET status = $3, status_changed_at = NOW()
     WHERE id = $1 AND shop_id = $2 AND status = 'active'
     RETURNING ${DEVICE_COLUMNS}`,
    [deviceId, shopId, status]
  );
  if (!rows[0]) throw new ApiError(404, "Active device not found");
  return rows[0];
};

// Which device a request comes from, by its token. Runs before the shop is known, so it can't
// use the tenant context — systemPool, matching on the token's hash only.
const findDeviceByToken = async (token) => {
  if (!token) return null;
  const { rows } = await systemPool.query(
    `SELECT d.id, d.shop_id, d.name, d.platform, d.receipt_prefix, d.status, s.is_active AS shop_is_active, s.tier AS shop_tier
     FROM devices d JOIN shops s ON s.id = d.shop_id
     WHERE d.token_hash = $1`,
    [hashToken(token)]
  );
  return rows[0] || null;
};

// Changes a device sent that the cloud couldn't apply (Sevices/syncService.js), for the owner to
// look at — open ones first. Resolving one only marks it seen; fixing it is done in the app.
const listRejections = async (shopId, { includeResolved = false } = {}) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.event_type, r.reason, r.payload, r.created_at, r.resolved_at, d.name AS device_name, d.receipt_prefix
     FROM sync_rejections r JOIN devices d ON d.id = r.device_id
     WHERE r.shop_id = $1 AND ($2 OR r.resolved_at IS NULL)
     ORDER BY r.resolved_at IS NOT NULL, r.created_at DESC
     LIMIT 200`,
    [shopId, includeResolved]
  );
  return rows;
};

const resolveRejection = async (shopId, rejectionId, userId) => {
  const { rows } = await pool.query(
    `UPDATE sync_rejections SET resolved_at = NOW(), resolved_by = $3
     WHERE id = $1 AND shop_id = $2 AND resolved_at IS NULL RETURNING id`,
    [rejectionId, shopId, userId]
  );
  if (!rows[0]) throw new ApiError(404, "Open sync issue not found");
  return rows[0];
};

// For the admin console's Health page: every active device across all shops that isn't in
// sync, worst first. Spans every shop by design, so systemPool.
const devicesNeedingAttention = async () => {
  const { rows } = await systemPool.query(
    `SELECT d.id, d.name, d.receipt_prefix, d.platform, d.last_seen_at, d.pending_count, d.oldest_pending_at,
            d.clock_skew_ms, d.status, s.id AS shop_id, s.name AS shop_name,
            (SELECT COUNT(*)::int FROM sync_rejections r WHERE r.device_id = d.id AND r.resolved_at IS NULL) AS open_rejections
     FROM devices d JOIN shops s ON s.id = d.shop_id
     WHERE d.status = 'active' AND s.is_active
     ORDER BY d.last_seen_at NULLS FIRST`
  );
  return rows
    .map((row) => ({ ...row, sync_state: syncState(row) }))
    .filter((row) => row.sync_state !== "in_sync" || row.open_rejections > 0);
};

// Housekeeping (maintenanceSweep.js): the change feed and sync history are kept 30 days. A
// device that hasn't pulled for longer than that has been blocked from selling since day 14
// and re-downloads its shop when it comes back.
const SYNC_HISTORY_DAYS = 30;
const purgeOldSyncHistory = async () => {
  const [feed, log] = await Promise.all([
    systemPool.query(`DELETE FROM sync_changes WHERE changed_at < NOW() - make_interval(days => $1)`, [SYNC_HISTORY_DAYS]),
    systemPool.query(`DELETE FROM sync_log WHERE created_at < NOW() - make_interval(days => $1)`, [SYNC_HISTORY_DAYS]),
  ]);
  return { feed: feed.rowCount, log: log.rowCount };
};

module.exports = {
  registerDevice,
  listDevices,
  setDeviceStatus,
  findDeviceByToken,
  syncState,
  listRejections,
  resolveRejection,
  devicesNeedingAttention,
  purgeOldSyncHistory,
  PLATFORMS,
};
