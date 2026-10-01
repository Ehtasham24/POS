const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");

// What a newly registered device downloads to start working offline (plan-offline-sync.md,
// phase 2): the shop, its settings and staff, its whole catalogue, the balances it must get
// right (customer ledgers, store-credit vouchers), and the last SNAPSHOT_DAYS of trading.
// Older history stays in the cloud and is read from there when online.
//
// It comes in pages, one table at a time, each its own request, so a slow or dropped
// connection only repeats a page. Pages aren't one consistent read — rows can change between
// them — which is why /start records the change-feed cursor first: everything that changes
// from then on is in the feed (migration 032) and arrives with the device's first pull, and
// applying a change twice is harmless.
const SNAPSHOT_DAYS = 20;
const PAGE_LIMIT = 1000;

// In load order (parents before children). `where` is added to "shop_id = $1"; $2 is the
// start of the trading window.
const TABLES = [
  { name: "users", where: "TRUE" },
  { name: "categories", where: "TRUE" },
  { name: "contacts", where: "TRUE" },
  { name: "products", where: "TRUE" },
  { name: "lots", where: "TRUE" },
  { name: "shifts", where: "(status = 'open' OR opened_at >= $2)" },
  {
    name: "shift_cash_movements",
    where: "shift_id IN (SELECT id FROM shifts WHERE shop_id = $1 AND (status = 'open' OR opened_at >= $2))",
  },
  { name: "sale_transactions", where: "created_at >= $2" },
  { name: "sales", where: "sale_time >= $2" },
  // Store-credit refunds are vouchers: kept whatever their age, so balances are right offline.
  { name: "refunds", where: "(refunded_at >= $2 OR refund_method = 'store_credit')" },
  { name: "store_credit_redemptions", where: "TRUE" },
  // The customer and supplier ledgers: every entry, since balances are their sum.
  { name: "party_transactions", where: "TRUE" },
  { name: "stock_adjustments", where: "adjusted_at >= $2" },
];
const TABLE_BY_NAME = new Map(TABLES.map((t) => [t.name, t]));

// The feed position the device's first pull starts after: every change up to it is already
// committed — so it's in what the pages return — and anything later is pulled. A change still
// being written has no place in the feed yet, so the cursor stops just before the oldest one.
const feedCursorSql = `
  SELECT COALESCE(
    (SELECT MIN(id) - 1 FROM sync_changes
     WHERE shop_id = $1 AND xid >= pg_snapshot_xmin(pg_current_snapshot())),
    (SELECT MAX(id) FROM sync_changes WHERE shop_id = $1),
    0) AS cursor`;

const startSnapshot = async (shopId) => {
  const [cursor, shop, settings, window] = await Promise.all([
    pool.query(feedCursorSql, [shopId]),
    pool.query(`SELECT * FROM shops WHERE id = $1`, [shopId]),
    pool.query(`SELECT * FROM settings WHERE shop_id = $1`, [shopId]),
    pool.query(`SELECT NOW() - make_interval(days => $1) AS since`, [SNAPSHOT_DAYS]),
  ]);
  const { forwarder_secret_hash: _cloudOnly, ...shopRow } = shop.rows[0]; // never leaves the cloud
  return {
    cursor: String(cursor.rows[0].cursor),
    since: window.rows[0].since,
    days: SNAPSHOT_DAYS,
    shop: shopRow,
    settings: settings.rows,
    tables: TABLES.map((t) => t.name),
  };
};

const snapshotPage = async (shopId, tableName, { since, afterId = 0, limit = PAGE_LIMIT }) => {
  const table = TABLE_BY_NAME.get(tableName);
  if (!table) throw new ApiError(404, "Unknown table");
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) throw new ApiError(400, "Invalid since");
  const after = Number(afterId);
  const pageSize = Math.min(Math.max(Number(limit) || PAGE_LIMIT, 1), PAGE_LIMIT);
  if (!Number.isSafeInteger(after) || after < 0) throw new ApiError(400, "Invalid afterId");

  const { rows } = await pool.query(
    `SELECT * FROM ${table.name}
     WHERE shop_id = $1 AND $2::timestamp IS NOT NULL AND ${table.where} AND id > $3
     ORDER BY id LIMIT $4`,
    // As a UTC ISO string: pg would send a Date in this machine's local time, and a timestamp
    // column drops the offset, shifting the window by the local UTC offset.
    [shopId, sinceDate.toISOString(), after, pageSize]
  );
  return { rows, done: rows.length < pageSize };
};

module.exports = { startSnapshot, snapshotPage, SNAPSHOT_DAYS, TABLES };
