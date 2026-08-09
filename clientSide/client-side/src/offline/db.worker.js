/* eslint-disable no-restricted-globals */

// Runs off the main thread (see the "Mobile performance" note in offline/db.js) — every
// SQL statement executes here, never blocking the UI. sql.js's WASM binary is fetched
// separately (public/sqljs/sql-wasm.wasm), not bundled into this chunk's JS.
import initSqlJs from "sql.js";
import { get, set } from "idb-keyval";
import { SCHEMA_SQL } from "./schema";

const IDB_KEY = "pos-offline-db";

let dbPromise = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await initSqlJs({ locateFile: (file) => `/sqljs/${file}` });
      const saved = await get(IDB_KEY);
      const db = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();
      db.exec(SCHEMA_SQL);
      return db;
    })();
  }
  return dbPromise;
}

// Only persisted after an actual write — never on a timer, never on reads.
async function persist(db) {
  const bytes = db.export();
  await set(IDB_KEY, bytes);
}

function rowsFromStatement(stmt, params) {
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

self.onmessage = async (event) => {
  const { id, type, sql, params } = event.data;
  try {
    const db = await getDb();
    let result;

    if (type === "query") {
      const stmt = db.prepare(sql);
      result = { rows: rowsFromStatement(stmt, params) };
    } else if (type === "run") {
      db.run(sql, params || []);
      await persist(db);
      result = { changes: db.getRowsModified() };
    } else if (type === "exec") {
      db.exec(sql);
      await persist(db);
      result = {};
    } else if (type === "batch") {
      // Runs every [sql, params] pair in sequence but persists only once at the end —
      // used for bulk refreshes (hundreds of rows) so a full-DB serialize doesn't happen
      // per row (see the Mobile performance note: persistence must stay event-driven).
      for (const [stmtSql, stmtParams] of event.data.statements) {
        db.run(stmtSql, stmtParams || []);
      }
      await persist(db);
      result = {};
    } else {
      throw new Error(`Unknown offline DB message type: ${type}`);
    }

    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};
