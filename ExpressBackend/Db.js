const { Pool, types } = require("pg");
const path = require("path");
require("dotenv").config({
  override: true,
  path: path.join(__dirname, "Development.env"),
});

// This database's session timezone is UTC (confirmed via `SHOW timezone`), so every
// "timestamp without time zone" / "date" value actually stored is UTC wall-clock digits —
// but pg's default parser for those types builds a JS Date by treating the naive digits as
// this PROCESS's own OS-local timezone (Asia/Karachi on the machine this normally runs on),
// not UTC. That mismatch silently shifted every timestamp read back into JS by the local
// UTC offset (e.g. a sale at 19:33 PKT was round-tripping and displaying as 14:33) — it
// never showed up as a thrown error, just a systematically wrong time everywhere. Overriding
// the parser to treat these as UTC (matching what they actually are) fixes every timestamp
// read anywhere in the app in one place, with no per-query changes needed.
// OIDs: 1082 = date, 1114 = timestamp (without time zone). 1184 (timestamptz) is untouched —
// pg already parses that correctly, since it round-trips with an explicit zone.
types.setTypeParser(1114, (value) => (value === null ? null : new Date(value + "Z")));
types.setTypeParser(1082, (value) => (value === null ? null : new Date(value + "T00:00:00Z")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// pg emits 'error' on idle clients (e.g. the pooler dropping a connection)
// as a plain EventEmitter event — with no listener, Node treats it as an
// unhandled error and crashes the whole process. Log and let the pool
// recover instead (it opens a fresh connection on the next query).
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client:", err);
});

module.exports = { pool };
