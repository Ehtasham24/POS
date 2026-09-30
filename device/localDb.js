// The device's own database: PGlite (Postgres compiled to WebAssembly), stored in a folder on
// the device and running inside the backend's own process.
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { pg_trgm } = require("@electric-sql/pglite/contrib/pg_trgm");
const { btree_gin } = require("@electric-sql/pglite/contrib/btree_gin");

const SCHEMA_FILE = path.join(__dirname, "schema.sql");

const openLocalDb = async (dataDir) => {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = await PGlite.create({ dataDir, extensions: { pg_trgm, btree_gin } });
  // UTC, like the cloud database: the backend reads "timestamp without time zone" values as UTC
  // (Db.js), but PGlite starts in the machine's own zone, which would store every sale's time
  // shifted by the local offset (+5h in Pakistan).
  await db.exec(`SET TIME ZONE 'UTC'; ALTER DATABASE postgres SET timezone TO 'UTC'`);
  const { rows } = await db.query(`SELECT to_regclass('public.shops') IS NOT NULL AS ready`);
  if (!rows[0].ready) {
    // One transaction: a first start interrupted halfway leaves an empty database, which the
    // next start simply sets up again.
    await db.transaction(async (tx) => tx.exec(fs.readFileSync(SCHEMA_FILE, "utf8")));
  }
  return db;
};

module.exports = { openLocalDb };
