// Main-thread client for db.worker.js — every call is a postMessage round-trip, so this
// module is the only place the rest of offline/ needs to know a Worker is involved at all.
let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./db.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data;
      const callback = pending.get(id);
      if (!callback) return;
      pending.delete(id);
      if (ok) callback.resolve(result);
      else callback.reject(new Error(error));
    };
  }
  return worker;
}

function send(message) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...message });
  });
}

// SELECT — resolves to an array of row objects.
export const query = (sql, params) => send({ type: "query", sql, params }).then((r) => r.rows);

// INSERT/UPDATE/DELETE — resolves to { changes }.
export const run = (sql, params) => send({ type: "run", sql, params });

// Schema / multi-statement execution, no bound params.
export const exec = (sql) => send({ type: "exec", sql });

// Runs many [sql, params] pairs but persists to IndexedDB only once at the end — use this
// instead of many individual run() calls for bulk writes (e.g. a full cache refresh).
export const runBatch = (statements) => send({ type: "batch", statements });
