// A device's first run (plan-offline-sync.md, phase 2): the shop owner signs in with their
// usual account, the device registers itself with the cloud (which hands it a token and its
// receipt prefix), then it downloads the shop — staff, catalogue, balances and the last few
// weeks of trading — into its own database. From then on it works offline.
//
// Runs in the background; the setup page polls setupState() for progress.
const crypto = require("crypto");
const { cloudClient } = require("./cloudClient");

// Rows this device creates get ids from here up, far above anything the cloud has handed out,
// so a row arriving from the cloud never collides with one made here (int4 tops out at ~2.1
// billion). Rows are matched across devices by uuid; these ids are only this database's own.
const LOCAL_ID_START = 1_000_000_000;
const INSERT_BATCH = 200;

let state = { status: "idle" };
const setupState = () => state;
const progress = (fields) => {
  state = { ...state, ...fields };
};

// JSON values as Postgres takes them: objects (jsonb columns) as JSON text. Timestamps arrive
// as UTC ISO strings, which a "timestamp without time zone" column stores as their UTC digits —
// the same wall-clock UTC the cloud stores.
const toParam = (value) => (value !== null && typeof value === "object" ? JSON.stringify(value) : value);

const insertRows = async (tx, table, rows, columns) => {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const cols = columns.filter((c) => c in batch[0]);
    const params = [];
    const values = batch.map((row) => `(${cols.map((c) => (params.push(toParam(row[c])), `$${params.length}`)).join(", ")})`);
    await tx.query(
      `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES ${values.join(", ")} ON CONFLICT DO NOTHING`,
      params
    );
  }
};

const runSetup = async ({ db, config, saveConfig, cloudUrl, username, password, deviceName, platform, appVersion }) => {
  progress({ status: "running", step: "signing_in", message: null, rows: 0 });
  // Registered already, but the download didn't finish last time: just download again.
  if (config.deviceToken) {
    return downloadShop({ db, config, saveConfig, cloud: cloudClient(config.cloudUrl, { deviceToken: config.deviceToken }) });
  }

  const cloud = cloudClient(cloudUrl);
  const user = await cloud.call("POST", "/api/auth/login", { body: { username, password } });
  if (user.role !== "owner") throw Object.assign(new Error("Only the shop owner can set up a device"), { status: 403 });

  progress({ step: "registering" });
  const deviceId = config.deviceId || crypto.randomUUID();
  const registration = await cloud.call("POST", "/api/devices/register", {
    body: { deviceId, name: deviceName, platform, appVersion },
  });
  // Saved before the download, so a setup that fails part-way can resume with this device
  // rather than registering (and using up the shop's limit) again.
  Object.assign(config, {
    deviceId,
    deviceToken: registration.token,
    receiptPrefix: registration.device.receipt_prefix,
    cloudUrl,
    shopId: registration.shop.id,
    deviceName,
  });
  saveConfig(config);
  await downloadShop({ db, config, saveConfig, cloud: cloudClient(cloudUrl, { deviceToken: registration.token }) });
};

// The snapshot, loaded in one local transaction: a download cut short leaves the database
// empty, and setup simply runs again.
const downloadShop = async ({ db, config, saveConfig, cloud }) => {
  progress({ step: "downloading" });
  const start = await cloud.call("GET", "/api/sync/snapshot");
  const pages = [];
  let total = 0;
  for (const table of start.tables) {
    let afterId = 0;
    for (;;) {
      const page = await cloud.call(
        "GET",
        `/api/sync/snapshot/${table}?since=${encodeURIComponent(start.since)}&afterId=${afterId}`
      );
      if (page.rows.length) pages.push({ table, rows: page.rows });
      total += page.rows.length;
      progress({ table, rows: total });
      if (page.done) break;
      afterId = page.rows[page.rows.length - 1].id;
    }
  }

  progress({ step: "saving" });
  await db.transaction(async (tx) => {
    // Older history isn't downloaded, so a row may point at one that isn't here (a voucher's
    // original sale, say). Foreign keys are for the cloud to enforce; loading skips them.
    await tx.exec(`SET LOCAL session_replication_role = replica`);
    const columnsOf = async (table) =>
      (await tx.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table])).rows.map(
        (r) => r.column_name
      );
    await insertRows(tx, "shops", [start.shop], await columnsOf("shops"));
    if (start.settings.length) await insertRows(tx, "settings", start.settings, await columnsOf("settings"));
    const columnCache = new Map();
    for (const { table, rows } of pages) {
      if (!columnCache.has(table)) columnCache.set(table, await columnsOf(table));
      await insertRows(tx, table, rows, columnCache.get(table));
    }
    // Every id sequence continues from LOCAL_ID_START (or past the highest downloaded id).
    const { rows: serials } = await tx.query(
      `SELECT c.table_name, pg_get_serial_sequence(c.table_name, 'id') AS seq
       FROM information_schema.columns c
       WHERE c.table_schema = 'public' AND c.column_name = 'id' AND pg_get_serial_sequence(c.table_name, 'id') IS NOT NULL`
    );
    for (const { table_name: table, seq } of serials) {
      await tx.query(`SELECT setval($1, GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${table}), $2))`, [seq, LOCAL_ID_START]);
    }
  });
  await db.exec(`SET pos.receipt_prefix = '${config.receiptPrefix}'`);

  const now = new Date().toISOString();
  Object.assign(config, { feedCursor: start.cursor, snapshotAt: now, snapshotSince: start.since, lastSyncAt: now });
  saveConfig(config);
  progress({ status: "done", step: "done", rows: total });
};

const startSetup = (options) => {
  if (state.status === "running") return false;
  state = { status: "running", step: "starting" };
  runSetup(options).catch((err) => {
    progress({ status: "error", message: err.message });
  });
  return true;
};

module.exports = { startSetup, setupState, LOCAL_ID_START };
