const { pool } = require("../Db");

// The REAL database size — Postgres's own accounting (data pages + indexes + TOAST +
// padding), not an estimate. This is what actually determines whether a Supabase plan's
// disk limit is about to be hit; the per-shop pg_column_size sums elsewhere in this app
// (adminService.js's getUsageByShop, storageQuotaService.js) are honest lower bounds for
// comparing shops to EACH OTHER, but they systematically under-count against this number —
// they only cover the shop_id-scoped tables (config/usageTables.js), and pg_column_size
// itself doesn't include index size or storage overhead. Use this one for "how close are we
// to the plan's actual limit"; use the per-shop estimates for "which shop is using how much
// relative to the others."
const getActualDatabaseSizeBytes = async () => {
  const { rows } = await pool.query(`SELECT pg_database_size(current_database())::bigint AS bytes`);
  return Number(rows[0].bytes);
};

module.exports = { getActualDatabaseSizeBytes };
