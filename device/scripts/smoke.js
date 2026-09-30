// Phase 0 smoke test: a fresh device database, the real backend on top of it, and a shop's
// day of work through the real API — sales from several cashiers at once, refund, void,
// stock adjustment, reports, shift close. Checks stock adds up afterwards and prints timings.
//
//   node scripts/smoke.js [--cashiers=5] [--sales=40]
//
// Uses its own folder (data/smoke), wiped first. Never touches the cloud database.
const fs = require("fs");
const path = require("path");
const { startDevice, stopDevice, login } = require("./harness");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
};
const CASHIERS = arg("cashiers", 5);
const SALES_PER_CASHIER = arg("sales", 40);
const DATA_DIR = path.join(__dirname, "..", "data", "smoke");
const PORT = 4110;
const OPENING_STOCK = 100000;

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  OK  " : "  FAIL"} ${label}${ok ? "" : `  -> ${JSON.stringify(detail).slice(0, 300)}`}`);
};
const timed = async (fn) => {
  const started = performance.now();
  const result = await fn();
  return [result, performance.now() - started];
};
const pct = (list, p) => {
  const sorted = [...list].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] || 0);
};

(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const device = await startDevice({
    dataDir: DATA_DIR,
    port: PORT,
    env: { POS_DEV_SHOP: "Local Test Shop:local_owner:Local-Owner-1" },
  });
  console.log(`Device up in ${device.startMs}ms (first start: creates the database and loads the schema)`);

  try {
    const owner = await login(device.base, "local_owner", "Local-Owner-1");
    check("Owner logs in against the local database", owner.user.role === "owner", owner.user);

    const category = await owner("POST", "/categories", { category_name: "General" });
    const productIds = [];
    for (let i = 0; i < 10; i++) {
      const res = await owner("POST", "/product", { name: `item ${i}`, buying_price: 100 + i, quantity: OPENING_STOCK, category_id: category.body.id });
      productIds.push(res.body.product.id);
    }
    check("Category and 10 products created", productIds.length === 10 && productIds.every(Boolean), productIds);

    const cashiers = [];
    for (let i = 0; i < CASHIERS; i++) {
      await owner("POST", "/api/users", { username: `local_cashier_${i}`, password: "Local-Cashier-1", displayName: `Cashier ${i}`, role: "cashier" });
      const api = await login(device.base, `local_cashier_${i}`, "Local-Cashier-1");
      const shift = await api("POST", "/api/shifts", { openingFloat: 1000 });
      cashiers.push({ api, shiftId: shift.body.id });
    }
    check(`${CASHIERS} cashiers, each with an open shift`, cashiers.every((c) => c.shiftId), cashiers.map((c) => c.shiftId));

    // Every cashier sells at the same time. Items in random order, so concurrent carts lock
    // products in different orders (the deadlock case fixed in salesService.js).
    const saleTimes = [];
    const errors = [];
    const sold = new Map();
    const saleIds = [];
    const [, wallMs] = await timed(() =>
      Promise.all(
        cashiers.map(async ({ api }) => {
          for (let s = 0; s < SALES_PER_CASHIER; s++) {
            const items = [...productIds].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3))
              .map((productID) => ({ productID, quantity: 1 + Math.floor(Math.random() * 3), sellingPrice: 250 }));
            const [res, ms] = await timed(() =>
              Promise.race([
                api("POST", "/api/sales/checkout", { items, paymentMethod: "cash" }),
                new Promise((resolve) => setTimeout(() => resolve({ status: 0, body: "timed out after 15s" }), 15000)),
              ])
            );
            saleTimes.push(ms);
            if (res.status !== 200) errors.push(res);
            else {
              for (const it of items) sold.set(it.productID, (sold.get(it.productID) || 0) + it.quantity);
              saleIds.push(...res.body.data.items.map((i) => ({ saleId: i.saleId, productID: i.productID, quantity: i.quantity })));
            }
          }
        })
      )
    );
    const total = CASHIERS * SALES_PER_CASHIER;
    check(`${total} checkouts from ${CASHIERS} cashiers at once, none failed or hung`, errors.length === 0, errors.slice(0, 3));
    console.log(`         checkout p50 ${pct(saleTimes, 50)}ms · p95 ${pct(saleTimes, 95)}ms · max ${pct(saleTimes, 100)}ms · ${(total / (wallMs / 1000)).toFixed(1)} sales/s`);

    // Refund (resellable, goes back on the shelf) and a void.
    const [refundTarget, voidTarget] = saleIds;
    const refund = await cashiers[0].api("POST", `/api/sales/${refundTarget.saleId}/refunds`, {
      quantity: 1, refundAmount: 250, refundMethod: "store_credit", condition: "resellable", reason: "smoke test",
    });
    check("Refund to store credit", refund.status < 300, refund);
    const voided = await owner("PATCH", `/api/sales/${voidTarget.saleId}/void`, { reason: "smoke test" });
    check("Void", voided.status < 300, voided);
    const adjusted = await owner("POST", "/api/stock-adjustments", { productId: productIds[9], quantityChange: -2, reasonCode: "damaged", note: "smoke" });
    check("Stock adjustment", adjusted.status < 300, adjusted);

    // Stock must equal opening − sold + refunded(resellable) + voided − adjusted, per product.
    const expected = new Map(productIds.map((id) => [id, OPENING_STOCK - (sold.get(id) || 0)]));
    expected.set(refundTarget.productID, expected.get(refundTarget.productID) + 1);
    expected.set(voidTarget.productID, expected.get(voidTarget.productID) + voidTarget.quantity);
    expected.set(productIds[9], expected.get(productIds[9]) - 2);
    const rows = (await owner("GET", "/products")).body;
    const wrong = rows.filter((r) => Number(r.quantity) !== expected.get(r.id));
    check("Stock adds up for every product", wrong.length === 0, wrong.map((r) => ({ ...r, expected: expected.get(r.id) })));

    // The pages an owner opens, with their timings.
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const range = { startDate: `${day(new Date(today - 7 * 86400000))}T00:00`, endDate: `${day(today)}T23:59` };
    const pages = [
      ["POST", "/api/Sales/summary", range],
      ["POST", "/api/Sales/breakdowns", range],
      ["POST", "/api/Sales/timeseries", range],
      ["POST", "/api/Sales/products", { ...range, page: 1, pageSize: 25 }],
      ["POST", "/api/Sales/payment-medium-totals", range],
      ["GET", `/api/BilledHistory?startDate=${range.startDate}&endDate=${range.endDate}&page=1&pageSize=25`],
      ["GET", "/api/inventory"],
      ["GET", "/api/getsales"],
      ["GET", "/api/shifts"],
      ["GET", `/api/stock-adjustments/summary?startDate=${range.startDate}&endDate=${range.endDate}`],
    ];
    for (const [method, url, body] of pages) {
      const [res, ms] = await timed(() => owner(method, url, body));
      check(`${method} ${url.split("?")[0]} (${Math.round(ms)}ms)`, res.status === 200, res);
    }
    // The report agrees with what was actually sold. A void removes one line, not its receipt.
    const { current } = (await owner("POST", "/api/Sales/summary", range)).body;
    const itemsSold = [...sold.values()].reduce((n, q) => n + q, 0) - voidTarget.quantity;
    check(
      `Report counts match the sales made (${current.transactions} transactions, ${current.itemsSold} items)`,
      current.transactions === total && current.itemsSold === itemsSold && current.refundCount === 1 && current.voidCount === 1,
      { current, itemsSold }
    );

    const close = await cashiers[1].api("PATCH", `/api/shifts/${cashiers[1].shiftId}/close`, { countedCash: 1000 });
    check("Shift closes with a cash count", close.status === 200, close);
  } catch (err) {
    fail++;
    console.error("CRASH", err);
  } finally {
    await stopDevice(device.child);
    const outside = device.log().match(/pool\.query while this request's transaction is open.*/g) || [];
    check("No query ran outside its request's open transaction", outside.length === 0, [...new Set(outside)]);
    if (fail) console.log(`\n--- device log (tail) ---\n${device.log().slice(-4000)}`);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
