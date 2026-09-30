// A pg-Pool-shaped wrapper around the device's in-process PGlite database, so the backend's
// Db.js (and every service on top of it) runs unchanged.
//
// PGlite is a single Postgres session. This decides what reaches it and when:
//   - one statement at a time;
//   - while a checked-out client has a transaction open, only that client's statements run —
//     everyone else waits until it commits or rolls back (exactly what separate connections
//     would see, minus the concurrency);
//   - a statement kept waiting longer than LOCK_WAIT_MS fails with a clear error instead of
//     hanging the register (the sign of code that opens a second transaction, or queries
//     outside its own, while one is open — see Db.js).
//
// Values cross the boundary the way pg's own driver sends and reads them — parameters through
// pg's prepareValue, results through pg's type parsers (including Db.js's UTC overrides) — so
// a query returns identical JS values here and in the cloud.
const LOCK_WAIT_MS = 15000;

// pg-types' built-in scalar parsers are registered by OID; array types need listing.
const ARRAY_OIDS = [199, 1000, 1005, 1007, 1009, 1014, 1015, 1016, 1021, 1022, 1115, 1182, 1185, 1231, 2951, 3807];

const BEGIN_PATTERN = /^\s*(BEGIN|START\s+TRANSACTION)\b/i;
const END_PATTERN = /^\s*(COMMIT|END|ABORT|ROLLBACK(?!\s+(WORK\s+|TRANSACTION\s+)?TO\b))\b/i;

const createPglitePool = (db, { types, prepareValue }) => {
  const parsers = {};
  for (const oid of [...Object.values(types.builtins), ...ARRAY_OIDS]) {
    const parse = types.getTypeParser(oid, "text");
    parsers[oid] = (value) => parse(value);
  }

  const queue = [];
  let running = false;
  let owner = null; // the client whose transaction is open, if any
  let waiting = 0;

  const toResult = (res) => ({
    rows: res.rows,
    fields: res.fields,
    rowCount: res.rows.length || res.affectedRows || 0,
  });

  const execute = async (text, values) => {
    if (values && values.length) {
      return toResult(await db.query(text, values.map((v) => prepareValue(v)), { parsers }));
    }
    // No parameters: may be several statements, which pg answers with an array of results.
    const results = (await db.exec(text, { parsers })).map(toResult);
    return results.length === 1 ? results[0] : results;
  };

  const pump = async () => {
    if (running) return;
    const index = queue.findIndex((item) => !owner || item.client === owner);
    if (index === -1) return;
    const [item] = queue.splice(index, 1);
    clearTimeout(item.timer);
    running = true;
    try {
      if (item.client && BEGIN_PATTERN.test(item.text)) owner = item.client;
      const result = await execute(item.text, item.values);
      if (item.client === owner && END_PATTERN.test(item.text)) owner = null;
      item.resolve(result);
    } catch (err) {
      // A failed BEGIN opened nothing; a failed COMMIT/ROLLBACK leaves Postgres to report
      // whether the transaction is still open.
      if (item.client === owner && !db.isInTransaction()) owner = null;
      item.reject(err);
    } finally {
      running = false;
      waiting = queue.length;
      pump();
    }
  };

  const run = (client, args) => {
    const [first, second] = args;
    const text = typeof first === "string" ? first : first.text;
    const values = typeof first === "string" ? second : first.values ?? second;
    return new Promise((resolve, reject) => {
      const item = { client, text, values, resolve, reject };
      item.timer = setTimeout(() => {
        const i = queue.indexOf(item);
        if (i === -1) return;
        queue.splice(i, 1);
        reject(new Error(`Local database busy: waited ${LOCK_WAIT_MS / 1000}s for another transaction to finish`));
      }, LOCK_WAIT_MS);
      queue.push(item);
      waiting = queue.length;
      pump();
    });
  };

  let clients = 0;
  return {
    query: (...args) => run(null, args),
    connect: async () => {
      clients++;
      const client = {
        query: (...args) => run(client, args),
        // A client handed back mid-transaction (an error path that skipped its ROLLBACK)
        // mustn't leave the whole database locked.
        release: () => {
          clients--;
          if (owner === client) run(client, ["ROLLBACK"]).catch(() => {});
        },
      };
      return client;
    },
    on: () => {},
    end: () => db.close(),
    get totalCount() {
      return clients;
    },
    get idleCount() {
      return 0;
    },
    get waitingCount() {
      return waiting;
    },
    options: { max: 1 },
  };
};

module.exports = { createPglitePool };
