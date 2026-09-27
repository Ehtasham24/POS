const { Pool, types } = require("pg");
const { AsyncLocalStorage } = require("async_hooks");
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

// max was unset before (pg's own default is 10) — fine for one shop's traffic, not for
// several shops' checkouts landing at once, which would exhaust it and queue requests
// behind it instead of failing fast. connectionTimeoutMillis turns "the pool is full"
// into a clear error instead of a request hanging indefinitely.
// DATABASE_URL already points at Supabase's transaction-mode pooler (port 6543, not the
// 5432 direct connection, which has a much lower connection cap) — that's what makes
// raising max here meaningful rather than just moving where the limit gets hit. Nothing
// in this app relies on session state surviving across queries on the same connection
// (setTypeParser above is client-side, not a session SET), which is the one thing
// transaction-mode pooling doesn't preserve — safe as long as that stays true. (The tenant
// context below is deliberately transaction-scoped for exactly this reason.)
const rawPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// pg emits 'error' on idle clients (e.g. the pooler dropping a connection)
// as a plain EventEmitter event — with no listener, Node treats it as an
// unhandled error and crashes the whole process. Log and let the pool
// recover instead (it opens a fresh connection on the next query).
rawPool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client:", err);
});

// ---------------------------------------------------------------------------------------
// Tenant isolation at the database level (row-level security, migration 028).
//
// Every service already filters by shop_id itself. This is the second, independent wall:
// while a request is running for a shop (requireAuth / requireForwarderSecret call
// runAsTenant), every statement runs as the `pos_app` role with `app.shop_id` pinned to that
// shop, and Postgres's own RLS policies hide every other shop's rows — so a query that
// forgets its shop_id filter returns this shop's rows only, instead of every shop's.
//
// Both settings are SET LOCAL, i.e. scoped to one transaction: DATABASE_URL is Supabase's
// transaction-mode pooler, where consecutive statements outside a transaction can land on
// different backend connections, so a session-level SET could leak one shop's context onto
// another request. The cost is a wrapper transaction around each standalone statement (see
// queryAsTenant) — two extra round trips, which is ~1ms when the app runs in the database's
// own region.
//
// Outside a tenant context (login, platform-admin routes, webhooks before they're
// identified, background sweeps) statements run exactly as before, as the connection's own
// role. systemPool is that same path made explicit, for the few tenant-request queries that
// legitimately span every shop (a global username-uniqueness check, the all-shops storage
// total) — each such use says why at its call site.
//
// DB_TENANT_RLS=off disables the wrapping entirely (every statement runs as before) — for
// diffing API responses with and without RLS (how this was validated: identical results on
// every tenant read endpoint) and as an emergency switch. Never meant to be off in production.
const tenantContext = new AsyncLocalStorage();
const RLS_ENABLED = process.env.DB_TENANT_RLS !== "off";
const TENANT_ROLE = "pos_app";

const runAsTenant = (shopId, fn) => tenantContext.run({ shopId }, fn);

const currentShopId = () => (RLS_ENABLED ? tenantContext.getStore()?.shopId ?? null : null);

// One round trip: open the transaction, drop to the RLS-bound role, pin the shop. Simple-
// query protocol (no parameters) is what allows the three statements in one message — the
// shop id is interpolated, so it's validated as a plain positive integer first.
// `beginStatement` is the caller's own transaction-start text (e.g. "BEGIN ISOLATION LEVEL
// SERIALIZABLE"), kept as-is so its options still apply.
const beginAsTenant = (shopId, beginStatement = "BEGIN") => {
  const id = Number(shopId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid tenant shop id: ${shopId}`);
  const begin = beginStatement.trim().replace(/;$/, "");
  return `${begin}; SET LOCAL ROLE ${TENANT_ROLE}; SELECT set_config('app.shop_id', '${id}', true)`;
};

const statementText = (args) => {
  const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
  return typeof text === "string" ? text : "";
};
// Every way a transaction can start or end. Missing one would quietly break atomicity: an
// unrecognized BEGIN would run in its own wrapper transaction (committed at once), and every
// write after it would then commit separately, so the caller's ROLLBACK undid nothing.
// ROLLBACK TO SAVEPOINT / RELEASE SAVEPOINT stay inside the transaction, so they're excluded
// from END. No service uses savepoints or non-plain BEGINs today; this keeps it that way safely.
const BEGIN_PATTERN = /^\s*(BEGIN|START\s+TRANSACTION)\b/i;
const END_PATTERN = /^\s*(COMMIT|END|ABORT|ROLLBACK(?!\s+(WORK\s+|TRANSACTION\s+)?TO\b))\b/i;

// Runs one statement in its own tenant transaction on `client`. A failed ROLLBACK means the
// connection itself is suspect, so the caller destroys it rather than returning it to the pool.
const runStatementAsTenant = async (rawQuery, shopId, args) => {
  // BEGIN is inside the try too: if BEGIN succeeds but SET LOCAL ROLE fails (e.g. migration
  // 028 not applied), the connection is left in an aborted transaction and must be rolled
  // back before it goes back to the pool.
  try {
    await rawQuery(beginAsTenant(shopId));
    const result = await rawQuery(...args);
    await rawQuery("COMMIT");
    return result;
  } catch (err) {
    try {
      await rawQuery("ROLLBACK");
    } catch {
      err.connectionBroken = true;
    }
    throw err;
  }
};

const queryAsTenant = async (shopId, args) => {
  const client = await rawPool.connect();
  let broken = false;
  try {
    return await runStatementAsTenant(client.query.bind(client), shopId, args);
  } catch (err) {
    broken = !!err.connectionBroken;
    throw err;
  } finally {
    client.release(broken || undefined);
  }
};

// A checked-out client (services' own BEGIN/COMMIT transactions). Their plain "BEGIN" becomes
// the tenant BEGIN — zero extra round trips for code that already runs a transaction — and a
// statement issued outside any transaction gets its own, same as pool.query.
const tenantClient = (client, shopId) => {
  const rawQuery = client.query.bind(client);
  let inTransaction = false;
  const wrapped = Object.create(client);
  wrapped.query = async (...args) => {
    const text = statementText(args);
    if (BEGIN_PATTERN.test(text)) {
      const results = await rawQuery(beginAsTenant(shopId, text));
      inTransaction = true;
      return Array.isArray(results) ? results[0] : results;
    }
    if (END_PATTERN.test(text)) {
      inTransaction = false;
      return rawQuery(...args);
    }
    if (inTransaction) return rawQuery(...args);
    return runStatementAsTenant(rawQuery, shopId, args);
  };
  wrapped.release = (...releaseArgs) => client.release(...releaseArgs);
  return wrapped;
};

// Same surface every service already uses (query/connect), so none of them changed.
const pool = {
  query: (...args) => {
    const shopId = currentShopId();
    return shopId ? queryAsTenant(shopId, args) : rawPool.query(...args);
  },
  connect: async () => {
    const client = await rawPool.connect();
    const shopId = currentShopId();
    return shopId ? tenantClient(client, shopId) : client;
  },
  end: () => rawPool.end(),
};

// Connection pool occupancy, for the admin console's Health page. `waiting` above zero means
// requests are queueing for a connection.
const poolStats = () => ({
  total: rawPool.totalCount,
  idle: rawPool.idleCount,
  waiting: rawPool.waitingCount,
  max: rawPool.options.max,
});

module.exports = { pool, systemPool: rawPool, runAsTenant, RLS_ENABLED, poolStats };
