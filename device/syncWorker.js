// Keeps a registered device and the cloud in step (plan-offline-sync.md, phase 3). Each cycle,
// while the device has a cloud registration:
//
//   push — the outbox (localDb.js's triggers) goes up in order, references as uuids; the cloud
//          says how far it applied, and that much is removed from the outbox.
//   pull — the shop's changes since the last pull come down (the cloud's change feed, by
//          transaction window) as current rows, and the device's copies are made to match.
//
// Push goes first, so a pull rarely meets a change of this device's own that hasn't reached the
// cloud. When it does, the stock counts are rebased: the cloud's count plus this device's
// changes still waiting to go up — and the device's other unsent edits to that row are kept.
//
// No internet is the normal state for a while, not an error to fix: sales keep landing in the
// outbox, and the next cycle that reaches the cloud sends them.
//
// How often: the cloud is one small server for every shop's registers, and quiet registers
// asking every few seconds would be most of its load. So a cycle comes FAST_MS after the last
// while the register is in use (someone made a request in the last IN_USE_MS) or the cycle moved
// data either way; after a quiet one, the wait doubles, up to IDLE_MAX_MS. A change made here (a
// sale) is sent WRITE_SYNC_DELAY_MS after it — sooner than before, not later. In use or not is
// told by the backend (ExpressBackend/utils/activity.js → noteActivity); a page refreshing a
// badge on its own doesn't count.
//
// Each pull also reports who used the register since the last one — each user's latest request
// and every sign-in here — for the admin panel's "Last active" (migration 037); the cloud
// otherwise never sees a register's sign-ins.
const { SYNC_TABLES, keyColumn, LOCAL_COLUMNS } = require("../ExpressBackend/utils/syncTables");
const { cloudClient } = require("./cloudClient");

const FAST_MS = 10000;
const IDLE_MAX_MS = 5 * 60 * 1000;
const IN_USE_MS = 2 * 60 * 1000;
const WRITE_SYNC_DELAY_MS = 1500;
const LOGINS_PER_REPORT = 20;

const nextDelay = (previous, { moved, inUse }) => (moved || inUse ? FAST_MS : Math.min(previous * 2, IDLE_MAX_MS));
const PUSH_BATCH = 200;
const { APP_VERSION } = require("./appInfo");

const createSyncWorker = ({ db, config, saveConfig }) => {
  const state = {
    online: null,
    syncing: false,
    lastSyncAt: config.lastSyncAt ?? null,
    lastError: null,
    pending: 0,
    oldestPendingAt: null,
    rejectedLastPush: 0,
  };
  let timer = null;
  let dueAt = Infinity;
  let running = false;
  let delay = FAST_MS;
  let lastUseAt = 0;
  let queue = Promise.resolve();
  let busy = false;
  const activity = new Map(); // local user id -> ms of their latest request

  const cloud = () => cloudClient(config.cloudUrl, { deviceToken: config.deviceToken });

  const refreshPending = async () => {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n, MIN(created_at) AS oldest FROM sync_outbox`);
    state.pending = rows[0].n;
    state.oldestPendingAt = rows[0].oldest;
  };

  const report = () => ({
    pendingCount: state.pending,
    oldestPendingAt: state.oldestPendingAt,
    deviceTime: new Date().toISOString(),
    appVersion: APP_VERSION,
  });

  // A row as the cloud wants it: no local ids, references as the referenced rows' uuids.
  const toWire = async (table, row) => {
    const data = { ...row };
    for (const column of LOCAL_COLUMNS) delete data[column];
    for (const [column, target] of Object.entries(SYNC_TABLES[table].refs)) {
      if (data[column] == null) continue;
      const { rows } = await db.query(`SELECT uuid FROM ${target} WHERE id = $1`, [data[column]]);
      data[column] = rows[0]?.uuid ?? null;
    }
    return data;
  };

  // Resolves to how many changes it sent.
  const push = async () => {
    await refreshPending();
    let sent = 0;
    for (;;) {
      const { rows } = await db.query(`SELECT * FROM sync_outbox ORDER BY seq LIMIT $1`, [PUSH_BATCH]);
      if (!rows.length) return sent;
      const events = [];
      for (const r of rows) {
        events.push({
          seq: Number(r.seq),
          eventUuid: r.event_uuid,
          table: r.table_name,
          op: r.op,
          key: r.row_key,
          row: r.row_data ? await toWire(r.table_name, r.row_data) : null,
          delta: r.delta,
        });
      }
      const result = await cloud().call("POST", "/api/sync/push", { body: { events, report: report() } });
      sent += events.length;
      state.rejectedLastPush = result.rejected?.length || 0;
      if (result.appliedThrough != null) {
        await db.query(`DELETE FROM sync_outbox WHERE seq <= $1`, [result.appliedThrough]);
      }
      await refreshPending();
      if (result.appliedThrough == null || result.appliedThrough < events[events.length - 1].seq) return sent;
    }
  };

  const localColumns = new Map();
  const columnsOf = async (client, table) => {
    if (!localColumns.has(table)) {
      const { rows } = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      localColumns.set(table, new Set(rows.map((r) => r.column_name)));
    }
    return localColumns.get(table);
  };

  // Makes this device's copy of one row match the cloud's (row null: the row is gone).
  const applyChange = async (client, { table, key, row }) => {
    const keyCol = keyColumn(table);
    if (!row) {
      await client.query(`DELETE FROM ${table} WHERE ${keyCol}::text = $1`, [key]);
      return;
    }
    const data = { ...row };
    for (const [column, target] of Object.entries(SYNC_TABLES[table].refs)) {
      if (data[column] == null) continue;
      const { rows } = await client.query(`SELECT id FROM ${target} WHERE uuid::text = $1`, [String(data[column])]);
      data[column] = rows[0]?.id ?? null;
    }
    const local = await columnsOf(client, table);
    const columns = Object.keys(data).filter((c) => local.has(c) && !LOCAL_COLUMNS.has(c));
    const params = (values) => columns.map((c) => (values[c] !== null && typeof values[c] === "object" ? JSON.stringify(values[c]) : values[c]));

    const { rows: existing } = await client.query(`SELECT id FROM ${table} WHERE ${keyCol}::text = $1`, [key]);
    if (!existing[0]) {
      const values = params(data);
      values.push(config.shopId);
      await client.query(
        `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(", ")}, shop_id)
         VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}, $${values.length})`,
        values
      );
      return;
    }

    // Unsent local changes to this row: keep them (they reach the cloud on the next push), and
    // put this device's stock changes back on top of the cloud's count.
    const { rows: pending } = await client.query(`SELECT delta FROM sync_outbox WHERE table_name = $1 AND row_key = $2`, [table, key]);
    const deltas = SYNC_TABLES[table].deltas || [];
    let update = columns.filter((c) => c !== keyCol);
    if (pending.length) {
      update = update.filter((c) => deltas.includes(c));
      for (const c of update) {
        const unsent = pending.reduce((sum, p) => sum + (Number(p.delta?.[c]) || 0), 0);
        data[c] = Number(data[c]) + unsent;
      }
    }
    if (!update.length) return;
    const values = update.map((c) => (data[c] !== null && typeof data[c] === "object" ? JSON.stringify(data[c]) : data[c]));
    values.push(existing[0].id);
    await client.query(
      `UPDATE ${table} SET ${update.map((c, i) => `"${c}" = $${i + 1}`).join(", ")} WHERE id = $${values.length}`,
      values
    );
  };

  // A cloud row whose unique value (a username, a product name) is held here by a different
  // row: one this device made that the cloud turned down (it's on the owner's sync issues
  // list). The cloud's row wins; the local one's value gets this device's prefix — the same
  // rule the cloud applies to clashing names — so the cloud's can be saved and syncing goes on.
  const yieldClashingValue = async (client, change, err) => {
    const constraint = err.constraint || /unique constraint "([^"]+)"/.exec(err.message)?.[1];
    if (!constraint) throw err;
    const { rows: cols } = await client.query(
      `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_class i JOIN pg_index x ON x.indexrelid = i.oid
       JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = ANY(x.indkey)
       WHERE i.relname = $1`,
      [constraint]
    );
    const textColumns = cols.filter((c) => c.attname !== "shop_id" && /^(text|character varying)/.test(c.type));
    if (!textColumns.length) throw err;
    const keyCol = keyColumn(change.table);
    for (const { attname } of textColumns) {
      await client.query(
        `UPDATE ${change.table} SET "${attname}" = "${attname}" || $1 WHERE "${attname}" = $2 AND ${keyCol}::text <> $3`,
        [` (${config.receiptPrefix})`, change.row[attname], change.key]
      );
    }
    await applyChange(client, change);
  };

  // One page of changes in one local transaction. Rows arrive parents first; a change that
  // trips a uniqueness rule is tried again once the rest of the page is in (the clashing name
  // may be renamed later in the page), and if it still clashes, the local row gives way.
  const applyPage = async (changes) => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = replica");
      let retry = [];
      for (const change of changes) {
        await client.query("SAVEPOINT change");
        try {
          await applyChange(client, change);
          await client.query("RELEASE SAVEPOINT change");
        } catch (err) {
          await client.query("ROLLBACK TO SAVEPOINT change");
          if (err.code !== "23505") throw err;
          retry.push(change);
        }
      }
      for (const change of retry) {
        await client.query("SAVEPOINT change");
        try {
          await applyChange(client, change);
          await client.query("RELEASE SAVEPOINT change");
        } catch (err) {
          await client.query("ROLLBACK TO SAVEPOINT change");
          if (err.code !== "23505") throw err;
          await yieldClashingValue(client, change, err);
        }
      }
      retry = [];
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };

  // Who used the register since the last report (see the top): each user's latest request, and
  // the sign-ins here after the last one reported. `done()` forgets what was sent, once the cloud
  // has it — a request made meanwhile stays for the next report.
  const usage = async () => {
    const { rows: logins } = await db.query(
      `SELECT e.id, e.created_at, u.uuid FROM login_events e JOIN users u ON u.id = e.user_id
       WHERE e.outcome = 'success' AND e.id > $1 ORDER BY e.id LIMIT $2`,
      [config.loginsReportedThrough ?? 0, LOGINS_PER_REPORT]
    );
    const sent = new Map(activity);
    const { rows: users } = sent.size ? await db.query(`SELECT id, uuid FROM users WHERE id = ANY($1::int[])`, [[...sent.keys()]]) : { rows: [] };
    const entries = [
      ...users.map((u) => ({ user: u.uuid, at: new Date(sent.get(u.id)).toISOString(), kind: "active" })),
      ...logins.map((l) => ({ user: l.uuid, at: new Date(l.created_at).toISOString(), kind: "login" })),
    ];
    return {
      entries,
      done: () => {
        for (const [id, at] of sent) if (activity.get(id) === at) activity.delete(id);
        if (logins.length) config.loginsReportedThrough = Number(logins[logins.length - 1].id);
      },
    };
  };

  // Resolves to how many changes came down.
  const pull = async (usageEntries) => {
    let upTo;
    let afterId = 0;
    let received = 0;
    for (;;) {
      const query = new URLSearchParams({ after: config.feedCursor });
      if (upTo) {
        query.set("upTo", upTo);
        query.set("afterId", String(afterId));
      } else if (usageEntries.length) {
        query.set("activity", JSON.stringify(usageEntries));
      }
      Object.entries(report()).forEach(([k, v]) => v != null && query.set(k, String(v)));
      const page = await cloud().call("GET", `/api/sync/pull?${query}`);
      if (page.changes.length) await applyPage(page.changes);
      received += page.changes.length;
      if (page.done) {
        config.feedCursor = page.nextCursor;
        // The page's banners reload when this changes (the frontend's ShopNotices).
        if (page.noticesStamp) state.noticesStamp = page.noticesStamp;
        return received;
      }
      upTo = page.upTo;
      afterId = page.afterId;
    }
  };

  // Resolves to whether any data moved, either way.
  const cycle = async () => {
    if (!config.deviceToken || !config.feedCursor) return false;
    state.syncing = true;
    try {
      const sent = await push();
      const usageReport = await usage();
      const received = await pull(usageReport.entries);
      usageReport.done();
      state.online = true;
      state.lastError = null;
      state.lastSyncAt = new Date().toISOString();
      config.lastSyncAt = state.lastSyncAt;
      saveConfig(config);
      return sent + received > 0;
    } catch (err) {
      state.online = !err.offline;
      state.lastError = err.message;
      // The cloud refused this device (retired, blocked, shop deactivated): stop trying.
      if (err.status === 401) state.revoked = err.message;
      return false;
    } finally {
      state.syncing = false;
      await refreshPending().catch(() => {});
    }
  };

  // The next cycle in `ms`; with `soonerOnly`, only if that's sooner than the one already due.
  const schedule = (ms, { soonerOnly = false } = {}) => {
    if (!running || state.revoked || (soonerOnly && Date.now() + ms >= dueAt)) return;
    clearTimeout(timer);
    dueAt = Date.now() + ms;
    timer = setTimeout(() => {
      dueAt = Infinity;
      if (!busy) syncNow();
    }, ms);
    timer.unref?.();
  };

  // A full cycle that starts after the call — one already running may have pushed before the
  // change the caller just made — and only one cycle at a time. The next one is then scheduled.
  const syncNow = () => {
    queue = queue.then(async () => {
      busy = true;
      let moved = false;
      try {
        moved = await cycle();
      } finally {
        busy = false;
        delay = nextDelay(delay, { moved, inUse: Date.now() - lastUseAt < IN_USE_MS });
        schedule(delay);
      }
    });
    return queue;
  };

  return {
    start() {
      running = true;
      refreshPending().catch(() => {});
      syncNow();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      return queue;
    },
    syncNow,
    // Someone used the register (ExpressBackend/utils/activity.js): back to the fast pace, and a
    // change of theirs goes up right after it's made.
    noteActivity(userId, { write = false } = {}) {
      lastUseAt = Date.now();
      activity.set(userId, lastUseAt);
      if (delay > FAST_MS) delay = FAST_MS;
      schedule(write ? WRITE_SYNC_DELAY_MS : FAST_MS, { soonerOnly: true });
    },
    state: () => ({ ...state }),
  };
};

module.exports = { createSyncWorker, nextDelay, FAST_MS, IDLE_MAX_MS };
