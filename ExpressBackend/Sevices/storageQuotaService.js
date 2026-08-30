const { pool } = require("../Db");
const { withCache } = require("../utils/cache");
const { USAGE_TABLES } = require("../config/usageTables");

// How close to its quota a shop needs to be before the shop-facing warning icon (a real,
// glowing badge in AppShell — see StorageWarningBadge.jsx) lights up. One constant, shared
// between the check here and the frontend's own copy of this number in that component, so
// they can never quietly disagree about what "near the limit" means.
const WARNING_THRESHOLD_PERCENT = 75;

const usageCacheKey = (shopId) => `storage-usage:${shopId}`;
// 10 minutes — this is polled by every logged-in user's browser (StorageWarningBadge, same
// 60s interval as LowStockBell/PendingBankPaymentsBell), so computing it fresh per poll
// would mean 14 GROUP-BY-less COUNT/SUM queries every minute per active shop. A cache this
// long means a shop that just blew past its quota might take up to 10 minutes to see the
// warning light up — an acceptable trade for how this number is actually used (a slow-
// moving storage trend, not something that needs to the second freshness the way a stock
// count does).
const USAGE_CACHE_TTL_SECONDS = 600;

// Same row-size measurement adminService.js's getUsageByShop does for every shop at once,
// just scoped to one shop_id (so it's cheap enough to run per-shop, not just per-admin-page-
// load) — see that function's own comment for why pg_column_size is a real, if lower-bound,
// measurement rather than a guess.
const getShopStorageBytes = async (shopId) => {
  let totalBytes = 0;
  for (const table of USAGE_TABLES) {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(pg_column_size(t.*)), 0)::bigint AS approx_bytes FROM ${table} t WHERE shop_id = $1`,
      [shopId]
    );
    totalBytes += Number(rows[0].approx_bytes);
  }
  return totalBytes;
};

// What the shop's own UI actually needs to know: how much it's using, what it's allowed
// (null if the admin never set a quota — meaning "not tracked," not "unlimited and worth
// showing 0%"), and whether that crosses the warning line. Returns nulls for
// percentUsed/isNearLimit when there's no quota to measure against, rather than a
// meaningless 0% that would look like reassuring good news.
const getShopStorageStatus = async (shopId) => {
  const { rows } = await pool.query(`SELECT storage_quota_bytes FROM shops WHERE id = $1`, [shopId]);
  // node-postgres returns BIGINT as a string — convert explicitly so percentUsed's division
  // below and the frontend's own comparisons are against a real number, not "2000".
  const quotaBytes = rows[0]?.storage_quota_bytes != null ? Number(rows[0].storage_quota_bytes) : null;

  const usedBytes = await withCache(usageCacheKey(shopId), USAGE_CACHE_TTL_SECONDS, () =>
    getShopStorageBytes(shopId)
  );

  const percentUsed = quotaBytes ? (usedBytes / quotaBytes) * 100 : null;
  return {
    usedBytes,
    quotaBytes,
    percentUsed,
    isNearLimit: percentUsed !== null && percentUsed >= WARNING_THRESHOLD_PERCENT,
  };
};

module.exports = { getShopStorageStatus, WARNING_THRESHOLD_PERCENT };
