const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { SYNC_TABLES, SYNC_ORDER, keyColumn, LOCAL_COLUMNS } = require("../utils/syncTables");

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

// A position in the change feed: a transaction id. Every transaction older than the oldest one
// still running has finished, so its changes are already visible; later ones are pulled
// (pullChanges). Taken before the snapshot pages are read, so nothing falls between the two —
// at worst a change arrives twice, which is harmless.
const feedCursorSql = `SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS cursor`;

const startSnapshot = async (shopId) => {
  const [cursor, shop, settings, window] = await Promise.all([
    pool.query(feedCursorSql),
    pool.query(`SELECT * FROM shops WHERE id = $1`, [shopId]),
    pool.query(`SELECT * FROM settings WHERE shop_id = $1`, [shopId]),
    pool.query(`SELECT NOW() - make_interval(days => $1) AS since`, [SNAPSHOT_DAYS]),
  ]);
  const { forwarder_secret_hash: _cloudOnly, ...shopRow } = shop.rows[0]; // never leaves the cloud
  return {
    cursor: cursor.rows[0].cursor,
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

// ---------------------------------------------------------------------------------------
// Pull: what changed in the shop since the device last asked (phase 3).
//
// The feed is read by transaction-id window, not by row id: rows get their ids when written but
// become visible when their transaction commits, so a long transaction can commit a row with a
// lower id after higher ones were already pulled. A pull covers transactions in [after, upTo),
// where upTo is the oldest transaction still running — every transaction below it has
// finished, so nothing more can appear in the window. The next pull starts at upTo. A window
// is paged by feed id; the device passes upTo and afterId back until done.
//
// Each change comes as the row's current state (null if it's gone) with references as uuids,
// so applying it means "make the device's copy look like this": repeatable, and several
// changes to one row arrive as one.
const PULL_LIMIT = 500;
const XID_PATTERN = /^\d+$/;

const columnCache = new Map();
const columnsOf = async (executor, table) => {
  if (!columnCache.has(table)) {
    const { rows } = await executor.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    columnCache.set(table, rows.map((r) => r.column_name));
  }
  return columnCache.get(table);
};

// Integer references -> the referenced rows' uuids, for rows of one table.
const refsToUuids = async (shopId, table, rows) => {
  for (const [column, target] of Object.entries(SYNC_TABLES[table].refs)) {
    const ids = [...new Set(rows.map((r) => r[column]).filter((v) => v != null))];
    if (!ids.length) continue;
    const { rows: found } = await pool.query(`SELECT id, uuid FROM ${target} WHERE shop_id = $1 AND id = ANY($2::int[])`, [
      shopId,
      ids,
    ]);
    const uuidById = new Map(found.map((f) => [f.id, f.uuid]));
    for (const row of rows) if (row[column] != null) row[column] = uuidById.get(row[column]) ?? null;
  }
};

const pullChanges = async (shopId, { after, upTo, afterId = 0 }) => {
  if (!XID_PATTERN.test(String(after ?? ""))) throw new ApiError(400, "Invalid cursor");
  if (upTo !== undefined && !XID_PATTERN.test(String(upTo))) throw new ApiError(400, "Invalid upTo");
  const lastId = Number(afterId) || 0;
  const windowEnd = upTo ?? (await pool.query(feedCursorSql)).rows[0].cursor;

  const { rows: feed } = await pool.query(
    `SELECT id, table_name, row_key FROM sync_changes
     WHERE shop_id = $1 AND xid >= $2::xid8 AND xid < $3::xid8 AND id > $4
     ORDER BY id LIMIT $5`,
    [shopId, after, windowEnd, lastId, PULL_LIMIT]
  );
  const keysByTable = new Map();
  for (const change of feed) {
    if (!SYNC_TABLES[change.table_name]) continue;
    if (!keysByTable.has(change.table_name)) keysByTable.set(change.table_name, new Set());
    keysByTable.get(change.table_name).add(change.row_key);
  }

  const changes = [];
  for (const table of SYNC_ORDER) {
    const keys = keysByTable.get(table);
    if (!keys) continue;
    const key = keyColumn(table);
    const { rows } = await pool.query(`SELECT * FROM ${table} WHERE shop_id = $1 AND ${key}::text = ANY($2::text[])`, [
      shopId,
      [...keys],
    ]);
    await refsToUuids(shopId, table, rows);
    const byKey = new Map(rows.map((r) => [String(r[key]), r]));
    for (const k of keys) {
      const row = byKey.get(k);
      if (row) for (const column of LOCAL_COLUMNS) delete row[column];
      changes.push({ table, key: k, row: row ?? null });
    }
  }
  const done = feed.length < PULL_LIMIT;
  return {
    changes,
    upTo: windowEnd,
    afterId: feed.length ? feed[feed.length - 1].id : lastId,
    done,
    nextCursor: done ? windowEnd : after,
  };
};

// ---------------------------------------------------------------------------------------
// Push: a device's own changes, in the order it made them (phase 3).
//
// Each event is applied in its own transaction together with the device's applied-up-to
// counter, so an event lands exactly once however often it's re-sent. Sequence numbers can
// skip (a transaction the device rolled back still used one up), so the rule is "higher than
// the last one applied", not "exactly the next": the device's database runs one transaction at
// a time, so its numbers are already in the order its changes committed. An event that can never apply — it points at a
// row the cloud doesn't have, or breaks a rule — goes to sync_rejections for the owner and
// counts as handled, so one bad event never blocks the device's queue.
//
// When the cloud's copy changed meanwhile: stock counts take the device's change on top
// (SYNC_TABLES deltas); any other column takes the value that reached the cloud last.
class Rejected extends Error {}

const uuidsToRefs = async (client, shopId, table, row) => {
  for (const [column, target] of Object.entries(SYNC_TABLES[table].refs)) {
    if (row[column] == null) continue;
    const { rows } = await client.query(`SELECT id FROM ${target} WHERE shop_id = $1 AND uuid::text = $2`, [
      shopId,
      String(row[column]),
    ]);
    if (!rows[0]) throw new Rejected(`It refers to a ${target} row the cloud does not have`);
    row[column] = rows[0].id;
  }
};

// The names the shop's own unique rules guard: a clash here is two devices (or a device and
// the web app) naming something the same offline. Both are kept, the device's marked with its
// receipt prefix, for the owner to merge.
const NAME_CLASHES = {
  products_shop_id_productname_key: "productname",
  categories_shop_id_category_name_key: "category_name",
};

const applyEvent = async (client, device, event) => {
  const { table, op, key, row, delta } = event;
  if (!SYNC_TABLES[table]) throw new Rejected(`Unknown table ${table}`);
  const keyCol = keyColumn(table);

  if (op === "delete") {
    try {
      await client.query("SAVEPOINT apply_delete");
      await client.query(`DELETE FROM ${table} WHERE shop_id = $1 AND ${keyCol}::text = $2`, [device.shop_id, String(key)]);
      await client.query("RELEASE SAVEPOINT apply_delete");
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT apply_delete");
      if (err.code === "23503") throw new Rejected("It is still referred to by other records in the cloud");
      throw err;
    }
    return;
  }
  if (op !== "insert" && op !== "update") throw new Rejected(`Unknown change ${op}`);
  if (!row || typeof row !== "object") throw new Rejected("No row data");

  const data = { ...row };
  for (const column of LOCAL_COLUMNS) delete data[column];
  await uuidsToRefs(client, device.shop_id, table, data);
  const cloudColumns = new Set(await columnsOf(client, table));
  const columns = Object.keys(data).filter((c) => cloudColumns.has(c));
  const deltaColumns = new Set(
    op === "update" && delta ? Object.keys(delta).filter((c) => (SYNC_TABLES[table].deltas || []).includes(c)) : []
  );

  const { rows: existing } = await client.query(
    `SELECT id FROM ${table} WHERE shop_id = $1 AND ${keyCol}::text = $2 FOR UPDATE`,
    [device.shop_id, String(key)]
  );
  const write = async (values) => {
    if (existing[0]) {
      const params = [existing[0].id];
      const sets = columns
        .filter((c) => c !== keyCol)
        .map((c) => {
          if (deltaColumns.has(c)) {
            params.push(Number(delta[c]) || 0);
            return `"${c}" = "${c}" + $${params.length}`;
          }
          params.push(values[c]);
          return `"${c}" = $${params.length}`;
        });
      if (sets.length) await client.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = $1`, params);
    } else {
      const params = columns.map((c) => values[c]);
      params.push(device.shop_id);
      await client.query(
        `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(", ")}, shop_id)
         VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}, $${params.length})`,
        params
      );
    }
  };

  try {
    await client.query("SAVEPOINT apply_write");
    await write(data);
    await client.query("RELEASE SAVEPOINT apply_write");
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT apply_write");
    const nameColumn = NAME_CLASHES[err.constraint];
    if (err.code === "23505" && nameColumn && !existing[0]) {
      await write({ ...data, [nameColumn]: `${data[nameColumn]} (${device.receipt_prefix})` });
      return;
    }
    if (err.code === "23505") throw new Rejected(`It clashes with an existing record (${err.constraint})`);
    if (err.code === "23503") throw new Rejected("It refers to a record the cloud does not have");
    if (["23514", "23502", "22P02", "22007", "22008"].includes(err.code)) throw new Rejected(err.message);
    throw err;
  }
};

const pushEvents = async (device, events) => {
  if (!Array.isArray(events)) throw new ApiError(400, "events must be a list");
  let appliedThrough = null;
  const rejected = [];
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(`SELECT last_applied_seq FROM devices WHERE id = $1 FOR UPDATE`, [device.id]);
      const last = Number(rows[0].last_applied_seq);
      appliedThrough = last;
      if (event.seq <= last) {
        await client.query("ROLLBACK");
        continue; // applied already: a re-send
      }
      await client.query("SAVEPOINT event");
      try {
        await applyEvent(client, device, event);
      } catch (err) {
        if (!(err instanceof Rejected)) throw err;
        await client.query("ROLLBACK TO SAVEPOINT event");
        await client.query(
          `INSERT INTO sync_rejections (device_id, shop_id, event_uuid, event_type, payload, reason)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (event_uuid) DO NOTHING`,
          [device.id, device.shop_id, event.eventUuid, `${event.table}.${event.op}`, JSON.stringify(event), err.message]
        );
        rejected.push({ seq: event.seq, reason: err.message });
      }
      await client.query(`UPDATE devices SET last_applied_seq = $2 WHERE id = $1`, [device.id, event.seq]);
      await client.query("COMMIT");
      appliedThrough = event.seq;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  return { appliedThrough, rejected };
};

// What the device reports about itself on every sync, kept on its devices row (how much it
// still has to send, its clock, its app version), and one sync_log line per call.
const recordDeviceContact = async (device, { direction, rows, durationMs, ok, error, report = {} }) => {
  const deviceTime = new Date(report.deviceTime);
  await pool.query(
    `UPDATE devices SET
       last_seen_at = NOW(),
       last_push_at = CASE WHEN $2 = 'push' AND $3 THEN NOW() ELSE last_push_at END,
       last_pull_at = CASE WHEN $2 = 'pull' AND $3 THEN NOW() ELSE last_pull_at END,
       pending_count = COALESCE($4, pending_count),
       oldest_pending_at = CASE WHEN $4::int IS NULL THEN oldest_pending_at ELSE $5::timestamp END,
       clock_skew_ms = COALESCE($6, clock_skew_ms),
       app_version = COALESCE($7, app_version),
       last_error = $8
     WHERE id = $1`,
    [
      device.id,
      direction,
      ok,
      // Pulls send the report as query parameters, so the numbers may arrive as text.
      report.pendingCount === undefined || report.pendingCount === "" || !Number.isInteger(Number(report.pendingCount))
        ? null
        : Number(report.pendingCount),
      report.oldestPendingAt ? new Date(report.oldestPendingAt).toISOString() : null,
      Number.isNaN(deviceTime.getTime()) ? null : Math.round(deviceTime.getTime() - Date.now()),
      report.appVersion || null,
      error || null,
    ]
  );
  await pool.query(
    `INSERT INTO sync_log (device_id, shop_id, direction, rows, duration_ms, ok, error) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [device.id, device.shop_id, direction, rows, durationMs, ok, error || null]
  );
};

module.exports = { startSnapshot, snapshotPage, pullChanges, pushEvents, recordDeviceContact, SNAPSHOT_DAYS, TABLES };
