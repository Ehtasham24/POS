// The device's own database: PGlite (Postgres compiled to WebAssembly), stored in a folder on
// the device and running inside the backend's own process.
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { pg_trgm } = require("@electric-sql/pglite/contrib/pg_trgm");
const { btree_gin } = require("@electric-sql/pglite/contrib/btree_gin");

const SCHEMA_FILE = path.join(__dirname, "schema.sql");
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
// What the very first device databases were created from, before schema.sql recorded it.
const FIRST_SCHEMA_VERSION = 31;

// device/migrations/NNN_*.sql, numbered after the cloud migration they follow.
const deviceMigrations = () =>
  fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .map((f) => ({ version: parseInt(f, 10), file: path.join(MIGRATIONS_DIR, f) }))
    .sort((a, b) => a.version - b.version);

// Brings the database up to date. A new one is created from schema.sql, which already contains
// every migration up to the version in its header; an existing one gets the migrations it
// hasn't had yet, each in its own transaction, so an interrupted upgrade simply resumes.
const migrate = async (db) => {
  const { rows } = await db.query(`SELECT to_regclass('public.shops') IS NOT NULL AS ready`);
  await db.exec(`CREATE TABLE IF NOT EXISTS device_migrations (
    version INTEGER PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT NOW())`);
  const recordUpTo = (version) =>
    db.query(`INSERT INTO device_migrations (version) SELECT unnest($1::int[]) ON CONFLICT DO NOTHING`, [
      [version, ...deviceMigrations().filter((m) => m.version <= version).map((m) => m.version)],
    ]);

  if (!rows[0].ready) {
    const schema = fs.readFileSync(SCHEMA_FILE, "utf8");
    const version = Number(schema.match(/^-- cloud-migrations: (\d+)$/m)?.[1]);
    if (!version) throw new Error("schema.sql has no cloud-migrations header (re-run scripts/export-schema.js)");
    await db.transaction(async (tx) => {
      await tx.exec(schema);
      await tx.query(`INSERT INTO device_migrations (version) VALUES ($1)`, [version]);
    });
    await recordUpTo(version);
  }
  const { rows: applied } = await db.query(`SELECT COUNT(*)::int AS n FROM device_migrations`);
  if (applied[0].n === 0) await recordUpTo(FIRST_SCHEMA_VERSION);

  const { rows: done } = await db.query(`SELECT version FROM device_migrations`);
  const doneSet = new Set(done.map((r) => r.version));
  for (const m of deviceMigrations().filter((m) => !doneSet.has(m.version))) {
    await db.transaction(async (tx) => {
      await tx.exec(fs.readFileSync(m.file, "utf8"));
      await tx.query(`INSERT INTO device_migrations (version) VALUES ($1)`, [m.version]);
    });
    console.log(`Local database: applied migration ${path.basename(m.file)}`);
  }
};

// Receipt and refund numbers this device hands out: "{prefix}-000123" and "{prefix}-R000123",
// from its own counters. The prefix is unique within the shop (assigned at registration), so
// two devices never issue the same number even while both are offline.
const installReceiptNumbering = async (db, receiptPrefix) => {
  if (!/^[A-Z][A-Z0-9]{0,5}$/.test(receiptPrefix)) throw new Error(`Invalid receipt prefix: ${receiptPrefix}`);
  await db.exec(`
    CREATE SEQUENCE IF NOT EXISTS device_receipt_seq;
    CREATE SEQUENCE IF NOT EXISTS device_refund_seq;
    CREATE OR REPLACE FUNCTION device_receipt_no() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      IF NEW.receipt_no IS NULL THEN
        NEW.receipt_no := current_setting('pos.receipt_prefix') || '-' || TG_ARGV[0]
          || lpad(nextval(TG_ARGV[1]::regclass)::text, 6, '0');
      END IF;
      RETURN NEW;
    END $fn$;
    DROP TRIGGER IF EXISTS trg_sale_transactions_receipt_no ON sale_transactions;
    CREATE TRIGGER trg_sale_transactions_receipt_no BEFORE INSERT ON sale_transactions
      FOR EACH ROW EXECUTE FUNCTION device_receipt_no('', 'device_receipt_seq');
    DROP TRIGGER IF EXISTS trg_refunds_receipt_no ON refunds;
    CREATE TRIGGER trg_refunds_receipt_no BEFORE INSERT ON refunds
      FOR EACH ROW EXECUTE FUNCTION device_receipt_no('R', 'device_refund_seq');
    SET pos.receipt_prefix = '${receiptPrefix}';
  `);
};

const openLocalDb = async (dataDir, { receiptPrefix }) => {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = await PGlite.create({ dataDir, extensions: { pg_trgm, btree_gin } });
  // UTC, like the cloud database: the backend reads "timestamp without time zone" values as UTC
  // (Db.js), but PGlite starts in the machine's own zone, which would store every sale's time
  // shifted by the local offset (+5h in Pakistan).
  await db.exec(`SET TIME ZONE 'UTC'; ALTER DATABASE postgres SET timezone TO 'UTC'`);
  await migrate(db);
  await installReceiptNumbering(db, receiptPrefix);
  return db;
};

module.exports = { openLocalDb };
