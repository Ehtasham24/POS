const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");

// Deliberately its own tiny table (migration 025), not the existing shop-scoped `settings`
// table with a NULL shop_id — this is platform-wide, and keeping it structurally separate
// means a query bug can never accidentally leak a platform setting into a per-shop read or
// vice versa.
const TOTAL_DB_CAPACITY_KEY = "total_db_capacity_bytes";

// Common Supabase plan tiers, for the admin UI's dropdown — Supabase has no API this app
// can query from inside Postgres to ask "what plan are we actually on" (that's account/
// billing-level, on Supabase's own side), so this is admin-entered based on their real
// plan. Free tier's real number (500 MB database, not the 10 GB that got typed in before
// this fix) is what migration 025 seeds as the default.
const SUPABASE_TIER_PRESETS = [
  { label: "Supabase Free (500 MB)", bytes: 500 * 1024 * 1024 },
  { label: "Supabase Pro (8 GB)", bytes: 8 * 1024 ** 3 },
  { label: "Supabase Team (8 GB, scalable)", bytes: 8 * 1024 ** 3 },
];

const getTotalDbCapacityBytes = async () => {
  const { rows } = await pool.query(`SELECT value FROM platform_settings WHERE key = $1`, [TOTAL_DB_CAPACITY_KEY]);
  // Falls back to the Free-tier default rather than throwing if the row is ever somehow
  // missing — a missing capacity setting should degrade to "assume the smallest plan," not
  // break every quota calculation in the app.
  return rows[0] ? Number(rows[0].value) : 500 * 1024 * 1024;
};

const setTotalDbCapacityBytes = async (bytes) => {
  const parsed = Number(bytes);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, "Total DB capacity must be a positive number of bytes");
  }
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [TOTAL_DB_CAPACITY_KEY, String(Math.round(parsed))]
  );
  return Math.round(parsed);
};

module.exports = { getTotalDbCapacityBytes, setTotalDbCapacityBytes, SUPABASE_TIER_PRESETS };
