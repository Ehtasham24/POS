// Load test: puts real traffic on a running server and on the database, then reports
// latency percentiles and errors.
//
//   node scripts/load-test.js [--users=20] [--seconds=60] [--db-concurrency=20] [--db-seconds=30]
//                             [--base=https://localhost:4000] [--skip-api] [--skip-db]
//
// Everything happens inside a TEMPORARY Advanced shop created for the run (products, a shift,
// sales) and removed at the end — including on Ctrl+C — so no real shop's data or reports are
// touched. The server must already be running at --base.
//
// Phase 1 (API): --users virtual users hammer a weighted mix of the shop app's real
// endpoints — register checkouts, product/inventory lists, sales history, reports — the way
// a busy shop would, for --seconds. The server's own Health numbers (connection pool, event
// loop) are sampled while it runs.
// Phase 2 (DB): the report queries are called directly (no HTTP, no cache) --db-concurrency
// at a time for --db-seconds, to see what the database alone can sustain.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? "0"; // local self-signed cert
const { signToken } = require("../utils/auth");
const { systemPool, runAsTenant, poolStats } = require("../Db");
const sales = require("../Sevices/salesService");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const value = hit.split("=")[1];
  return value === undefined ? true : typeof fallback === "number" ? Number(value) : value;
};
const USERS = arg("users", 20);
const SECONDS = arg("seconds", 60);
const DB_CONCURRENCY = arg("db-concurrency", 20);
const DB_SECONDS = arg("db-seconds", 30);
const BASE = arg("base", "https://localhost:4000");
const PRODUCT_COUNT = 30;

// ---------------------------------------------------------------------------------------
// Latency bookkeeping
const stats = new Map();
const record = (label, ms, ok, detail) => {
  let s = stats.get(label);
  if (!s) stats.set(label, (s = { times: [], errors: 0, lastError: null }));
  s.times.push(ms);
  if (!ok) {
    s.errors++;
    s.lastError = detail;
  }
};
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
const report = (title, seconds) => {
  const rows = [...stats.entries()].map(([label, s]) => {
    const t = [...s.times].sort((a, b) => a - b);
    return {
      label,
      count: t.length,
      "req/s": +(t.length / seconds).toFixed(1),
      errors: s.errors,
      p50: Math.round(pct(t, 50)),
      p95: Math.round(pct(t, 95)),
      p99: Math.round(pct(t, 99)),
      max: Math.round(t[t.length - 1] || 0),
    };
  });
  rows.sort((a, b) => b.p95 - a.p95);
  const all = [...stats.values()].flatMap((s) => s.times).sort((a, b) => a - b);
  const errors = rows.reduce((n, r) => n + r.errors, 0);
  console.log(`\n=== ${title} ===`);
  console.table(rows);
  console.log(
    `TOTAL ${all.length} calls · ${(all.length / seconds).toFixed(1)}/s · errors ${errors} (${((errors / (all.length || 1)) * 100).toFixed(2)}%) · p50 ${Math.round(pct(all, 50))}ms · p95 ${Math.round(pct(all, 95))}ms · p99 ${Math.round(pct(all, 99))}ms`
  );
  for (const [label, s] of stats) if (s.lastError) console.log(`  last error on ${label}: ${String(s.lastError).slice(0, 200)}`);
  stats.clear();
  return errors;
};

// ---------------------------------------------------------------------------------------
// HTTP
const api = async (token, method, url, body) => {
  const res = await fetch(BASE + url, {
    method,
    headers: { "content-type": "application/json", cookie: `pos_session=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json ?? text };
};
const mustOk = (res, what) => {
  if (res.status >= 400) throw new Error(`${what} failed: ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  return res.body;
};

const pad = (n) => String(n).padStart(2, "0");
const localStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const range = () => {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400000);
  return { startDate: localStamp(start), endDate: localStamp(new Date(end.getTime() + 86400000)) };
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// The shop-app traffic mix — weights roughly follow a busy register: mostly sales and
// product lookups, with the owner opening reports now and then. Entries marked "owner" run
// with the owner's session (owner-only pages); the rest run as the virtual user's own cashier.
const actions = (ctx) => [
  [30, "POST checkout", () => {
    const items = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({
      productID: pick(ctx.productIds),
      quantity: 1 + Math.floor(Math.random() * 2),
      sellingPrice: 100 + Math.floor(Math.random() * 400),
    }));
    return ["cashier", "POST", "/api/sales/checkout", { items, paymentMethod: pick(["cash", "card", "cash"]) }];
  }],
  [12, "GET products", () => ["cashier", "GET", "/products"]],
  [10, "GET inventory", () => ["owner", "GET", "/api/inventory"]],
  [5, "GET categories", () => ["cashier", "GET", "/categories"]],
  [5, "GET settings", () => ["owner", "GET", "/api/settings"]],
  [5, "GET shifts/current", () => ["cashier", "GET", "/api/shifts/current"]],
  [5, "GET getsales", () => ["cashier", "GET", "/api/getsales"]],
  [8, "GET BilledHistory", () => {
    const r = range();
    return ["cashier", "GET", `/api/BilledHistory?startDate=${r.startDate}&endDate=${r.endDate}&page=1&pageSize=25`];
  }],
  [4, "POST Sales/summary", () => ["owner", "POST", "/api/Sales/summary", range()]],
  [4, "POST Sales/breakdowns", () => ["owner", "POST", "/api/Sales/breakdowns", range()]],
  [4, "POST Sales/timeseries", () => ["owner", "POST", "/api/Sales/timeseries", range()]],
  [4, "POST Sales/products", () => ["owner", "POST", "/api/Sales/products", { ...range(), page: 1, pageSize: 25 }]],
  [4, "POST payment-medium-totals", () => ["owner", "POST", "/api/Sales/payment-medium-totals", range()]],
];
const weighted = (list) => {
  const total = list.reduce((n, [w]) => n + w, 0);
  return () => {
    let r = Math.random() * total;
    for (const entry of list) if ((r -= entry[0]) < 0) return entry;
    return list[list.length - 1];
  };
};

// ---------------------------------------------------------------------------------------
// Temporary shop
let shopId = null;

const setUp = async () => {
  const { rows: admins } = await systemPool.query(
    `SELECT id, display_name FROM users WHERE role = 'superadmin' AND is_active LIMIT 1`
  );
  if (!admins.length) throw new Error("No superadmin account — run scripts/create-superadmin.js first");
  const adminToken = signToken({ id: admins[0].id, role: "superadmin", displayName: admins[0].display_name });

  const stamp = Date.now().toString(36);
  const created = mustOk(
    await api(adminToken, "POST", "/api/admin/shops", {
      name: `ZZ Load Test ${stamp}`,
      tier: "advanced",
      ownerUsername: `zz_load_${stamp}`,
      ownerPassword: `Load-Test-${stamp}-1`,
      maxUsers: USERS + 1,
    }),
    "Creating the temporary shop"
  );
  shopId = created.shop.id;
  const token = signToken({ id: created.owner.id, role: "owner", displayName: "Load Test" });

  const category = mustOk(await api(token, "POST", "/categories", { category_name: "Load test" }), "Creating a category");
  const productIds = [];
  for (let i = 0; i < PRODUCT_COUNT; i++) {
    const body = mustOk(
      await api(token, "POST", "/product", {
        name: `load item ${i}`,
        buying_price: 50 + i,
        quantity: 1000000, // never runs out during the test
        category_id: category.id,
      }),
      "Creating a product"
    );
    productIds.push(body.product.id);
  }
  // One cashier per virtual user, each on their own shift — the way a real shop runs (one
  // shift per person), so sales don't all queue on a single shift row.
  const cashierTokens = [];
  for (let i = 0; i < USERS; i++) {
    const cashier = mustOk(
      await api(token, "POST", "/api/users", {
        username: `zz_load_${stamp}_c${i}`,
        password: `Load-Test-${stamp}-1`,
        displayName: `Cashier ${i + 1}`,
        role: "cashier",
      }),
      "Creating a cashier"
    );
    const cashierToken = signToken({ id: cashier.id, role: "cashier", displayName: `Cashier ${i + 1}` });
    mustOk(await api(cashierToken, "POST", "/api/shifts", { openingFloat: 1000 }), "Opening a shift");
    cashierTokens.push(cashierToken);
  }
  console.log(`Temporary shop #${shopId} ready: ${PRODUCT_COUNT} products, ${USERS} cashiers each with an open shift.`);
  return { adminToken, token, cashierTokens, productIds };
};

// Deletes every row the run created: each table with a shop_id column, retried until the
// foreign keys stop objecting (children go before parents), then the shop itself.
const cleanUp = async () => {
  if (!shopId) return;
  const id = shopId;
  shopId = null;
  const { rows } = await systemPool.query(
    `SELECT c.table_name FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND c.column_name = 'shop_id' AND t.table_type = 'BASE TABLE'`
  );
  let pending = rows.map((r) => r.table_name);
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const failed = [];
    for (const table of pending) {
      try {
        await systemPool.query(`DELETE FROM "${table}" WHERE shop_id = $1`, [id]);
      } catch {
        failed.push(table);
      }
    }
    pending = failed;
  }
  await systemPool.query(`DELETE FROM shops WHERE id = $1`, [id]);
  console.log(pending.length ? `Cleanup left rows in: ${pending.join(", ")}` : `Temporary shop #${id} removed.`);
};

// ---------------------------------------------------------------------------------------
// Phases
const runFor = async (seconds, workers, step) => {
  const deadline = Date.now() + seconds * 1000;
  await Promise.all(
    Array.from({ length: workers }, async (_, worker) => {
      while (Date.now() < deadline) await step(worker);
    })
  );
};

const apiPhase = async ({ adminToken, token, cashierTokens, productIds }) => {
  console.log(`\nAPI phase: ${USERS} virtual users for ${SECONDS}s against ${BASE} ...`);
  const next = weighted(actions({ productIds }));
  const health = [];
  const sampler = setInterval(async () => {
    const res = await api(adminToken, "GET", "/api/admin/health").catch(() => null);
    if (res?.status === 200) health.push(res.body);
  }, 5000);

  await runFor(SECONDS, USERS, async (worker) => {
    const [, label, build] = next();
    const [as, method, url, body] = build();
    const started = performance.now();
    try {
      const res = await api(as === "owner" ? token : cashierTokens[worker], method, url, body);
      record(label, performance.now() - started, res.status < 400, `${res.status} ${JSON.stringify(res.body)}`);
    } catch (err) {
      record(label, performance.now() - started, false, err.message);
    }
  });
  clearInterval(sampler);

  const errors = report(`API phase (${USERS} users, ${SECONDS}s)`, SECONDS);
  if (health.length) {
    const max = (f) => Math.max(...health.map(f));
    console.log(
      `Server during the run: pool busy up to ${max((h) => h.database.pool.total - h.database.pool.idle)}/${health[0].database.pool.max}` +
        ` · requests waiting for a connection up to ${max((h) => h.database.pool.waiting)}` +
        ` · event-loop lag p99 up to ${max((h) => h.process.eventLoopLagMs.p99)}ms` +
        ` · DB ping up to ${max((h) => h.database.pingMs || 0)}ms` +
        ` · heap up to ${Math.round(max((h) => h.process.heapUsedBytes) / 1048576)}MB`
    );
  }
  return errors;
};

const dbPhase = async () => {
  console.log(`\nDB phase: report queries called directly, ${DB_CONCURRENCY} at a time for ${DB_SECONDS}s ...`);
  const r = range();
  const queries = [
    ["ping SELECT 1", () => systemPool.query("SELECT 1")],
    ["fetchReportSummary", () => sales.fetchReportSummary(r.startDate, r.endDate, null, shopId)],
    ["fetchReportBreakdowns", () => sales.fetchReportBreakdowns(r.startDate, r.endDate, null, shopId)],
    ["fetchSalesTimeSeries", () => sales.fetchSalesTimeSeries(r.startDate, r.endDate, null, shopId)],
    ["fetchReportProducts", () => sales.fetchReportProducts({ ...r, page: 1, pageSize: 25 }, shopId)],
    ["fetchPaymentMediumTotals", () => sales.fetchPaymentMediumTotals(r.startDate, r.endDate, shopId)],
    ["fetchBilledHistory", () => sales.fetchBilledHistory(r.startDate, r.endDate, null, 1, 25, null, "all", null, null, shopId)],
    ["getRecentSales", () => sales.getRecentSales(shopId)],
  ];
  let maxWaiting = 0;
  const sampler = setInterval(() => (maxWaiting = Math.max(maxWaiting, poolStats().waiting)), 200);
  await runFor(DB_SECONDS, DB_CONCURRENCY, async () => {
    const [label, run] = pick(queries);
    const started = performance.now();
    try {
      await runAsTenant(shopId, run);
      record(label, performance.now() - started, true);
    } catch (err) {
      record(label, performance.now() - started, false, err.message);
    }
  });
  clearInterval(sampler);
  const errors = report(`DB phase (${DB_CONCURRENCY} concurrent, ${DB_SECONDS}s)`, DB_SECONDS);
  console.log(`Script's own pool: max ${poolStats().max} connections, up to ${maxWaiting} queries queued for one.`);
  return errors;
};

// ---------------------------------------------------------------------------------------
let exiting = false;
const finish = async (code) => {
  if (exiting) return;
  exiting = true;
  try {
    await cleanUp();
  } catch (err) {
    console.error("Cleanup failed:", err.message);
  }
  await systemPool.end().catch(() => {});
  process.exit(code);
};
process.on("SIGINT", () => {
  console.log("\nInterrupted — cleaning up the temporary shop ...");
  finish(130);
});

(async () => {
  let errors = 0;
  try {
    const ctx = await setUp();
    if (!arg("skip-api", false)) errors += await apiPhase(ctx);
    if (!arg("skip-db", false)) errors += await dbPhase();
  } catch (err) {
    console.error("Load test crashed:", err);
    errors++;
  }
  await finish(errors ? 1 : 0);
})();
