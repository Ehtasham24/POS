const { systemPool } = require("../Db");

// When each shop user last used the app — the admin panel's "Last active" (migration 037).
// requireAuth notes every request a person made; a page refreshing a badge on its own sends
// X-POS-Background (the frontend's utils/api.js, { background: true }) and doesn't count.
//
// In the cloud it's written at most once per WRITE_EVERY_MS per user, so someone working
// steadily costs one small upsert every few minutes. A register (POS_RUNTIME=device) has no
// user_activity table: it hands the note to its sync (device/syncWorker.js), which reports it
// to the cloud with its next pull — and syncs sooner while someone is using it. A register's
// requests passed on to the cloud (Middleware/deviceReadThrough.js) are left to that report.
//
// systemPool throughout: user_activity is platform-only (RLS on, no pos_app grant), like
// login_events — monitoring for the platform admin that no shop reads.
const ON_DEVICE = process.env.POS_RUNTIME === "device";
const WRITE_EVERY_MS = 5 * 60 * 1000;
const lastWritten = new Map(); // userId -> ms

const isBackground = (req) => req.get("x-pos-background") === "1";

// rows: [{ userId, shopId, at (Date), deviceId }]. A later time only ever moves it forward; of a
// user's several rows (a register's report: their last request and a sign-in), the latest counts.
const recordActivity = async (all) => {
  const latest = new Map();
  for (const row of all) if (!latest.has(row.userId) || latest.get(row.userId).at < row.at) latest.set(row.userId, row);
  const rows = [...latest.values()];
  if (!rows.length) return;
  await systemPool.query(
    `INSERT INTO user_activity (user_id, shop_id, last_active_at, device_id)
     SELECT a.user_id, a.shop_id, a.at AT TIME ZONE 'UTC', a.device_id
     FROM unnest($1::int[], $2::int[], $3::timestamptz[], $4::uuid[]) AS a (user_id, shop_id, at, device_id)
     ON CONFLICT (user_id) DO UPDATE SET last_active_at = EXCLUDED.last_active_at, device_id = EXCLUDED.device_id
     WHERE user_activity.last_active_at < EXCLUDED.last_active_at`,
    [rows.map((r) => r.userId), rows.map((r) => r.shopId), rows.map((r) => r.at.toISOString()), rows.map((r) => r.deviceId ?? null)]
  );
};

const noteActivity = (req, user) => {
  if (!user.shopId || req.deviceReadThrough || isBackground(req)) return;
  if (ON_DEVICE) {
    global.posDevice?.noteActivity?.(user.id, { write: req.method !== "GET" });
    return;
  }
  const now = Date.now();
  if (now - (lastWritten.get(user.id) ?? 0) < WRITE_EVERY_MS) return;
  lastWritten.set(user.id, now);
  recordActivity([{ userId: user.id, shopId: user.shopId, at: new Date(now) }]).catch((err) => {
    // Monitoring only — never the reason a request fails.
    lastWritten.delete(user.id);
    console.error("Activity write failed:", err.message);
  });
};

module.exports = { noteActivity, recordActivity };
