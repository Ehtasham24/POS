const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({
  override: true,
  path: path.join(__dirname, "Development.env"),
});

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
