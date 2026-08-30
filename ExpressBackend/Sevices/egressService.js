const { pool } = require("../Db");

// The write side of this — one row per shop per day, incremented per request — lives in
// Server.js's egress-tracking middleware. Kept here purely as a data-access layer so that
// middleware (and adminService.js's usage report) don't each hand-write their own SQL
// against the same table.

// Fire-and-forget from the middleware (never awaited on the request's own critical path) —
// a dropped or delayed egress write should never slow down or fail an actual API response.
// ON CONFLICT accumulates rather than overwrites, since a shop can have many requests in
// the same calendar day.
const recordEgress = async (shopId, bytes) => {
  if (!shopId || !(bytes > 0)) return;
  await pool.query(
    `INSERT INTO shop_egress_daily (shop_id, day, bytes, request_count)
     VALUES ($1, CURRENT_DATE, $2, 1)
     ON CONFLICT (shop_id, day) DO UPDATE
     SET bytes = shop_egress_daily.bytes + EXCLUDED.bytes,
         request_count = shop_egress_daily.request_count + 1`,
    [shopId, Math.round(bytes)]
  );
};

// Summed over the trailing N days for every shop that has any egress recorded — a shop
// with zero rows here (brand new, or nobody's used it in the window) simply isn't in the
// returned array; callers (adminService.js's getUsageByShop) already default to 0.
const getEgressByShop = async (days = 30) => {
  const { rows } = await pool.query(
    `SELECT shop_id, SUM(bytes)::bigint AS bytes, SUM(request_count)::int AS request_count
     FROM shop_egress_daily
     WHERE day >= CURRENT_DATE - ($1 || ' days')::interval
     GROUP BY shop_id`,
    [days]
  );
  return rows.map((r) => ({ shopId: r.shop_id, bytes: Number(r.bytes), requestCount: r.request_count }));
};

// One shop's real daily egress for the trailing N days, zero-filled for any day with no
// recorded requests (a real, honest zero — not a gap) so a line chart has one point per
// calendar day instead of jumping across missing ones.
const getDailyEgressSeries = async (shopId, days = 30) => {
  const { rows } = await pool.query(
    `SELECT d::date AS day,
            COALESCE(e.bytes, 0)::bigint AS bytes,
            COALESCE(e.request_count, 0)::int AS request_count
     FROM generate_series(CURRENT_DATE - ($1 || ' days')::interval, CURRENT_DATE, '1 day') AS d
     LEFT JOIN shop_egress_daily e ON e.shop_id = $2 AND e.day = d::date
     ORDER BY d`,
    [days - 1, shopId]
  );
  return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), bytes: Number(r.bytes), requestCount: r.request_count }));
};

// Real, measured "bytes of egress per checkout" — summed across every shop's actual traffic
// over the trailing window, divided by how many real sale_transactions happened in that same
// window. Used by storageEstimatorService.js to project a NEW shop's future egress from its
// projected transaction volume, the same way avgBytesPerRow projects future storage: from
// this app's own currently-observed behavior, not a guessed per-checkout constant.
const getEgressPerTransactionRatio = async (days = 30) => {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COALESCE(SUM(bytes), 0) FROM shop_egress_daily WHERE day >= CURRENT_DATE - ($1 || ' days')::interval) AS total_egress_bytes,
       (SELECT COUNT(*) FROM sale_transactions WHERE created_at >= NOW() - ($1 || ' days')::interval) AS total_transactions`,
    [days]
  );
  const totalEgressBytes = Number(rows[0].total_egress_bytes);
  const totalTransactions = Number(rows[0].total_transactions);
  return totalTransactions > 0 ? totalEgressBytes / totalTransactions : 0;
};

module.exports = { recordEgress, getEgressByShop, getDailyEgressSeries, getEgressPerTransactionRatio };
