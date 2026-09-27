// Multi-tenant isolation test: creates a real second shop, seeds it with data that
// deliberately collides in name with shop 1's data, then hits every list/read endpoint as
// both shops and asserts neither ever sees the other's rows. Cleans up everything it
// created at the end regardless of pass/fail.
//
// This repo has no test framework wired up yet (package.json's "test" script is a stub),
// so this is a plain, standalone script rather than a Jest/Mocha suite — run it directly
// whenever a new shop-scoped table or query is added, to catch the exact class of bug this
// was written for (a forgotten shop_id filter, or one left ambiguous by a later JOIN).
//
// Requires: the backend already running on https://localhost:4000 (npm start), and a real
// shop 1 with at least one contact already in the database (used for one of the checks).
//
// Usage: node scripts/verify-shop-isolation.js

// Self-signed dev cert (Db.js/Server.js's own ssl: {rejectUnauthorized:false} for the DB
// connection has the same reasoning) — this only ever talks to localhost:4000.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("dotenv").config({ path: require("path").join(__dirname, "../Development.env") });
const { pool } = require("../Db");
const { hashPassword } = require("../Sevices/authService");
const { signToken } = require("../utils/auth");

const BASE = "https://localhost:4000";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let pass = 0;
let fail = 0;
const failures = [];
function check(label, cond, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push({ label, detail });
    console.log(`  FAIL  ${label}${detail !== undefined ? " -> " + JSON.stringify(detail) : ""}`);
    return;
  }
  console.log(`  OK    ${label}`);
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `pos_session=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body: json };
}

async function main() {
  const created = { shopId: null, userId: null, productIds: [], categoryIds: [], contactIds: [] };

  try {
    console.log("=== Setup: creating a real second shop ===");
    const { rows: shopRows } = await pool.query(
      `INSERT INTO shops (name, slug, tier) VALUES ('Isolation Test Shop', 'isolation-test', 'advanced') RETURNING id`
    );
    created.shopId = shopRows[0].id;
    console.log(`  Created shop 2, id=${created.shopId}`);

    const hash = await hashPassword("isolation-test-pw-12345");
    const { rows: userRows } = await pool.query(
      `INSERT INTO users (username, password_hash, display_name, role, is_active, shop_id)
       VALUES ('isolation_test_owner', $1, 'Isolation Test Owner', 'owner', true, $2) RETURNING id`,
      [hash, created.shopId]
    );
    created.userId = userRows[0].id;
    console.log(`  Created shop 2 owner, id=${created.userId}`);

    const shop1Token = signToken({ id: 1, role: "owner", displayName: "admin" });
    const shop2Token = signToken({ id: created.userId, role: "owner", displayName: "Isolation Test Owner" });

    // Confirm shop1's real shopId (should be 1, but read it for real rather than assume).
    // Read straight off the users table, not /api/auth/me — that response is deliberately
    // reshaped to shop.{tier,features} for the frontend (authController.js) and no longer
    // exposes a raw numeric shop id at all.
    const { rows: shop1UserRows } = await pool.query("SELECT shop_id FROM users WHERE id = 1");
    const shop1Id = shop1UserRows[0].shop_id;
    console.log(`  Shop 1's real shopId (via DB): ${shop1Id}`);

    console.log("\n=== Seeding shop 2 with NAME-COLLIDING data ===");
    const { rows: catRows } = await pool.query(
      `INSERT INTO categories (category_name, shop_id) VALUES ('Drinks', $1) RETURNING id`,
      [created.shopId]
    );
    created.categoryIds.push(catRows[0].id);
    const { rows: prodRows } = await pool.query(
      `INSERT INTO products (productname, buyingprice, quantity, category_id, shop_id) VALUES ('Pepsi', 999, 500, $1, $2) RETURNING id`,
      [catRows[0].id, created.shopId]
    );
    created.productIds.push(prodRows[0].id);
    const { rows: contactRows } = await pool.query(
      `INSERT INTO contacts (name, is_customer, is_vendor, shop_id) VALUES ('Isolation Test Contact', true, false, $1) RETURNING id`,
      [created.shopId]
    );
    created.contactIds.push(contactRows[0].id);
    console.log(`  Seeded: category ${catRows[0].id} ("Drinks"), product ${prodRows[0].id} ("Pepsi"), contact ${contactRows[0].id}`);

    console.log("\n=== Cross-shop list checks ===");

    const [cats1, cats2] = await Promise.all([
      api(shop1Token, "GET", "/categories"),
      api(shop2Token, "GET", "/categories"),
    ]);
    check(
      "Shop 1's categories never include shop 2's 'Drinks' category id",
      !cats1.body.some((c) => c.id === catRows[0].id)
    );
    check(
      "Shop 2's categories include exactly its own 'Drinks', and only its own rows",
      cats2.body.length === 1 && cats2.body[0].id === catRows[0].id,
      cats2.body
    );

    const [prods1, prods2] = await Promise.all([
      api(shop1Token, "GET", "/products"),
      api(shop2Token, "GET", "/products"),
    ]);
    check("Shop 1's products never include shop 2's 'Pepsi'", !prods1.body.some((p) => p.id === prodRows[0].id));
    check(
      "Shop 2's products are exactly its own seeded 'Pepsi', nothing from shop 1",
      prods2.body.length === 1 && prods2.body[0].id === prodRows[0].id,
      prods2.body
    );

    const [contacts1, contacts2] = await Promise.all([
      api(shop1Token, "GET", "/api/contacts"),
      api(shop2Token, "GET", "/api/contacts"),
    ]);
    check("Shop 1's contacts never include shop 2's contact", !contacts1.body.some((c) => c.id === contactRows[0].id));
    check(
      "Shop 2's contacts are exactly its own",
      contacts2.body.length === 1 && contacts2.body[0].id === contactRows[0].id,
      contacts2.body
    );

    const [search1, search2] = await Promise.all([
      api(shop1Token, "GET", "/api/search?q=Pepsi"),
      api(shop2Token, "GET", "/api/search?q=Pepsi"),
    ]);
    check("Shop 1's search for 'Pepsi' finds nothing (shop 1 has no Pepsi)", search1.body.length === 0, search1.body);
    check(
      "Shop 2's search for 'Pepsi' finds exactly its own product",
      search2.body.length === 1 && search2.body[0].product_id === prodRows[0].id,
      search2.body
    );

    const [inv1, inv2] = await Promise.all([
      api(shop1Token, "GET", "/api/inventory"),
      api(shop2Token, "GET", "/api/inventory"),
    ]);
    check("Shop 1's inventory never includes shop 2's product", !inv1.body.items.some((i) => i.id === prodRows[0].id));
    check(
      "Shop 2's inventory is exactly its own seeded product",
      inv2.body.items.length === 1 && inv2.body.items[0].id === prodRows[0].id,
      inv2.body.items
    );

    const [users1, users2] = await Promise.all([
      api(shop1Token, "GET", "/api/users"),
      api(shop2Token, "GET", "/api/users"),
    ]);
    check("Shop 1's user list never includes shop 2's owner", !users1.body.some((u) => u.id === created.userId));
    check(
      "Shop 2's user list is exactly its own owner",
      users2.body.length === 1 && users2.body[0].id === created.userId,
      users2.body
    );

    console.log("\n=== Settings isolation ===");
    await api(shop1Token, "PUT", "/api/settings", { key: "isolation_test_key", value: "shop1-value" });
    await api(shop2Token, "PUT", "/api/settings", { key: "isolation_test_key", value: "shop2-value" });
    const [set1, set2] = await Promise.all([
      api(shop1Token, "GET", "/api/settings"),
      api(shop2Token, "GET", "/api/settings"),
    ]);
    check(
      "Shop 1 and shop 2 have independent settings for the same key",
      set1.body.isolation_test_key === "shop1-value" && set2.body.isolation_test_key === "shop2-value",
      { shop1: set1.body.isolation_test_key, shop2: set2.body.isolation_test_key }
    );

    console.log("\n=== Shifts: the two critical leaks found during implementation ===");
    const openShop2 = await api(shop2Token, "POST", "/api/shifts", { openingFloat: 1000 });
    check("Shop 2 owner can open a shift", openShop2.status === 201, openShop2.body);
    const shop2ShiftId = openShop2.body.id;

    const shiftsAsShop1 = await api(shop1Token, "GET", "/api/shifts");
    check(
      "listShifts: shop 1 never sees shop 2's shift in the list",
      Array.isArray(shiftsAsShop1.body) && !shiftsAsShop1.body.some((s) => s.id === shop2ShiftId),
      shiftsAsShop1.body
    );

    const detailAsShop1 = await api(shop1Token, "GET", `/api/shifts/${shop2ShiftId}`);
    check(
      "getShiftDetail: shop 1 gets 404 for shop 2's shift id, not the actual detail",
      detailAsShop1.status === 404,
      detailAsShop1.body
    );

    const closeAsShop1 = await api(shop1Token, "PATCH", `/api/shifts/${shop2ShiftId}/close`, { countedCash: 1000 });
    check(
      "closeShift: shop 1 cannot close shop 2's shift",
      closeAsShop1.status === 404,
      closeAsShop1.body
    );

    // Clean up: close it properly as shop 2 itself.
    await api(shop2Token, "PATCH", `/api/shifts/${shop2ShiftId}/close`, { countedCash: 1000 });

    console.log("\n=== Stock Adjustments / Shrinkage isolation ===");
    const adjResult = await api(shop2Token, "POST", "/api/stock-adjustments", {
      productId: prodRows[0].id,
      quantityChange: -5,
      reasonCode: "damaged",
      note: "isolation test",
    });
    check("Shop 2 can create a stock adjustment on its own product", adjResult.status === 201, adjResult.body);

    const adjAsShop1 = await api(shop1Token, "GET", "/api/stock-adjustments");
    check(
      "Shop 1's stock adjustments list never includes shop 2's adjustment",
      Array.isArray(adjAsShop1.body) && !adjAsShop1.body.some((a) => a.product_id === prodRows[0].id),
      adjAsShop1.body
    );

    const today = new Date();
    const startD = new Date(today.getTime() - 24 * 3600 * 1000).toISOString();
    const endD = new Date(today.getTime() + 24 * 3600 * 1000).toISOString();
    const shrinkAsShop1 = await api(shop1Token, "GET", `/api/stock-adjustments/summary?startDate=${startD}&endDate=${endD}`);
    check(
      "Shop 1's shrinkage summary doesn't include shop 2's damaged Pepsi",
      !shrinkAsShop1.body.byProduct.some((p) => p.product_id === prodRows[0].id),
      shrinkAsShop1.body
    );

    console.log("\n=== Product delete cross-shop safety (Failure Mode 4 fix) ===");
    // Give shop 1 a product with the SAME name shop 2 has ("Pepsi"), so we can prove
    // deleting shop 1's "Pepsi" never touches shop 2's.
    const { rows: shop1PepsiRows } = await pool.query(
      `INSERT INTO products (productname, buyingprice, quantity, shop_id) VALUES ('Pepsi', 100, 10, $1) RETURNING id`,
      [shop1Id]
    );
    const shop1PepsiId = shop1PepsiRows[0].id;
    const deleteResult = await api(shop1Token, "DELETE", `/product/${shop1PepsiId}`);
    check("Shop 1 can delete its own 'Pepsi'", deleteResult.status === 200, deleteResult.body);

    const stillThere = await pool.query(`SELECT id FROM products WHERE id = $1`, [prodRows[0].id]);
    check(
      "Shop 2's 'Pepsi' is UNTOUCHED after shop 1 deleted its own same-named product",
      stillThere.rows.length === 1,
      stillThere.rows
    );

    console.log("\n=== Sales Report aggregation isolation (Failure Mode 3) ===");
    // Give each shop one sale of their own differently-priced same-named product, then
    // confirm the report never merges them.
    // (Uses direct inserts to avoid needing a full checkout flow / open shift bureaucracy
    // for this narrow check — sales_ledger reads straight from the sales table.)
    await pool.query(
      `INSERT INTO sales (selling_price, quantity, product_id, sale_time, buying_price, shop_id)
       VALUES (50, 1, $1, NOW(), 10, $2)`,
      [prodRows[0].id, created.shopId]
    );
    const reportAsShop2 = await api(shop2Token, "POST", "/api/Sales/products", { startDate: startD, endDate: endD, search: "Pepsi" });
    const pepsiRowsInShop2Report = reportAsShop2.body.rows.filter((r) => r.productname === "Pepsi");
    check(
      "Shop 2's sales report shows its own Pepsi sale at its own price (50), not merged with any other shop's",
      pepsiRowsInShop2Report.length === 1 && Number(pepsiRowsInShop2Report[0].avgPrice) === 50,
      pepsiRowsInShop2Report
    );

    console.log("\n=== Everyday writes still work under row-level security ===");
    // Every write below runs as the pos_app role pinned to shop 2 (Db.js). RLS's WITH CHECK
    // and the per-table grants (migration 028) would reject any of them that wrote a row
    // outside shop 2, or touched a table pos_app has no grant for.
    const ok = (res) => res.status >= 200 && res.status < 300;
    const w = {};
    w.category = await api(shop2Token, "POST", "/categories", { category_name: "RLS Writes" });
    check("Create category", ok(w.category), w.category.body);
    w.vendor = await api(shop2Token, "POST", "/api/contacts", { name: "RLS Vendor", is_vendor: true, is_customer: true });
    check("Create contact", ok(w.vendor), w.vendor.body);
    const vendorId = w.vendor.body?.id;
    if (vendorId) created.contactIds.push(vendorId);
    w.plain = await api(shop2Token, "POST", "/product", {
      name: "RLS Plain",
      buying_price: 40,
      quantity: 50,
      category_id: w.category.body?.id,
    });
    check("Create plain product", ok(w.plain), w.plain.body);
    w.batch = await api(shop2Token, "POST", "/product", {
      name: "RLS Batch",
      buying_price: 60,
      quantity: 20,
      category_id: w.category.body?.id,
      batch_tracked: true,
      vendor_id: vendorId,
    });
    check("Create batch product + first lot (lot_sequences upsert)", ok(w.batch) && !!w.batch.body?.lot?.id, w.batch.body);
    const plainId = w.plain.body?.product?.id;
    const batchId = w.batch.body?.product?.id;
    const lotId = w.batch.body?.lot?.id;

    w.shift = await api(shop2Token, "POST", "/api/shifts", { openingFloat: 1000 });
    check("Open shift", ok(w.shift), w.shift.body);

    w.checkout = await api(shop2Token, "POST", "/api/sales/checkout", {
      paymentMethod: "cash",
      items: [
        { productID: plainId, quantity: 3, sellingPrice: 100 },
        { productID: batchId, lotId, quantity: 2, sellingPrice: 150 },
      ],
    });
    check("Checkout (plain + lot item)", ok(w.checkout), w.checkout.body);
    const [plainSale, lotSale] = w.checkout.body?.data?.items || [];

    w.refund = await api(shop2Token, "POST", `/api/sales/${plainSale?.saleId}/refunds`, {
      quantity: 1,
      refundAmount: 100,
      refundMethod: "store_credit",
      condition: "resellable",
      reason: "rls write test",
      contactId: vendorId,
    });
    check("Refund as store credit (voucher issued)", ok(w.refund), w.refund.body);
    w.redeem = await api(shop2Token, "POST", "/api/sales/checkout", {
      paymentMethod: "cash",
      voucherCode: w.refund.body?.refundNo,
      storeCreditRedeemed: 100,
      items: [{ productID: plainId, quantity: 2, sellingPrice: 100 }],
    });
    check("Checkout redeeming that voucher", ok(w.redeem), w.redeem.body);
    w.void = await api(shop2Token, "PATCH", `/api/sales/${lotSale?.saleId}/void`, { reason: "rls write test" });
    check("Void a lot sale (stock back to its lot)", ok(w.void), w.void.body);

    w.adjust = await api(shop2Token, "POST", "/api/stock-adjustments", {
      productId: batchId,
      lotId,
      quantityChange: -1,
      reasonCode: "expired",
    });
    check("Stock adjustment on a lot", ok(w.adjust), w.adjust.body);

    w.charge = await api(shop2Token, "POST", "/api/parties/transactions", {
      contactId: vendorId,
      direction: "receivable",
      kind: "charge",
      amount: 500,
    });
    w.payment = await api(shop2Token, "POST", "/api/parties/transactions", {
      contactId: vendorId,
      direction: "receivable",
      kind: "payment",
      amount: 200,
    });
    const balances = await api(shop2Token, "GET", "/api/parties/balances?direction=receivable");
    check(
      "Udhaar charge + payment, balance derived through the party_balances view",
      ok(w.charge) && ok(w.payment) && Number(balances.body?.[vendorId]) === 300,
      { charge: w.charge.body, payment: w.payment.body, balances: balances.body }
    );

    for (const [key, value] of [
      ["bank_name", "RLS Test Bank"],
      ["bank_account_title", "RLS Test"],
      ["bank_iban", "PK36SCBL0000001123456702"],
    ]) {
      await api(shop2Token, "PUT", "/api/settings", { key, value });
    }
    w.intent = await api(shop2Token, "POST", "/api/bank-payments/intents", {
      items: [{ productID: plainId, quantity: 1, sellingPrice: 100 }],
    });
    w.confirm = await api(shop2Token, "PATCH", `/api/bank-payments/intents/${w.intent.body?.id}/confirm`);
    check(
      "Bank transfer: create intent, confirm it (runs a full checkout inside)",
      ok(w.intent) && ok(w.confirm) && w.confirm.body?.status === "confirmed",
      { intent: w.intent.body?.status ?? w.intent.body, confirm: w.confirm.body?.status ?? w.confirm.body }
    );

    w.cashier = await api(shop2Token, "POST", "/api/users", {
      username: `rls_cashier_${created.shopId}`,
      password: "rls-cashier-pw-1",
      displayName: "RLS Cashier",
      role: "cashier",
    });
    w.cashierEdit = await api(shop2Token, "PATCH", `/api/users/${w.cashier.body?.id}`, { displayName: "RLS Cashier 2" });
    check("Create + edit a staff user", ok(w.cashier) && ok(w.cashierEdit), { create: w.cashier.body, edit: w.cashierEdit.body });

    w.close = await api(shop2Token, "PATCH", `/api/shifts/${w.shift.body?.id}/close`, { countedCash: 1500 });
    check("Close shift", ok(w.close), w.close.body);

    const stock = await pool.query(
      `SELECT (SELECT quantity FROM products WHERE id = $1) AS plain_qty, (SELECT qty_remaining FROM lots WHERE id = $2) AS lot_qty`,
      [plainId, lotId]
    );
    // plain: 50 - 3 sold + 1 refunded (resellable) - 2 redeemed - 1 bank transfer = 45
    // lot:   20 - 2 sold + 2 voided - 1 expired = 19
    check(
      "Stock math end to end (plain 45, lot 19)",
      Number(stock.rows[0].plain_qty) === 45 && Number(stock.rows[0].lot_qty) === 19,
      stock.rows[0]
    );
    created.productIds.push(plainId, batchId);
    if (w.category.body?.id) created.categoryIds.push(w.category.body.id);

    console.log("\n=== Foreign keys: attaching a record to ANOTHER shop's contact/category/sale ===");
    // A foreign key only proves the target row exists, and FK checks ignore row-level
    // security — so each of these is guarded in the app (utils/shopOwnership.js).
    const one = async (sql) => (await pool.query(sql, [shop1Id])).rows[0];
    const shop1Contact = await one(`SELECT id FROM contacts WHERE shop_id = $1 LIMIT 1`);
    const shop1Category = await one(`SELECT id FROM categories WHERE shop_id = $1 LIMIT 1`);
    const shop1Sale = await one(`SELECT id FROM sales WHERE shop_id = $1 LIMIT 1`);

    const fkProduct = await api(shop2Token, "POST", "/product", {
      name: "Isolation FK Probe",
      buying_price: 10,
      quantity: 1,
      category_id: shop1Category.id,
    });
    // Each 400 must be the ownership check's own message — not some unrelated validation
    // error that would make the check pass for the wrong reason.
    check(
      "Product can't be created under shop 1's category",
      fkProduct.status === 400 && fkProduct.body?.message === "Category not found",
      fkProduct.body
    );

    const fkShift = await api(shop2Token, "POST", "/api/shifts", { openingFloat: 500 });
    created.fkShiftId = fkShift.body?.id;
    const fkMovement = await api(shop2Token, "POST", `/api/shifts/${created.fkShiftId}/cash-movement`, {
      amount: -100,
      reason: "isolation probe",
      contactId: shop1Contact.id,
    });
    check(
      "Shift cash movement can't point at shop 1's contact (its name used to leak into shift detail)",
      fkMovement.status === 400 && fkMovement.body?.message === "Contact not found",
      fkMovement.body
    );
    const okMovement = await api(shop2Token, "POST", `/api/shifts/${created.fkShiftId}/cash-movement`, {
      amount: -100,
      reason: "isolation probe",
      contactId: contactRows[0].id,
    });
    check("...but its own contact is still accepted", okMovement.status === 201, okMovement.body);
    await api(shop2Token, "PATCH", `/api/shifts/${created.fkShiftId}/close`, { countedCash: 400 });

    const fkParty = await api(shop2Token, "POST", "/api/parties/transactions", {
      contactId: contactRows[0].id,
      direction: "receivable",
      kind: "charge",
      amount: 100,
      saleId: shop1Sale.id,
    });
    check(
      "Udhaar entry can't link to shop 1's sale",
      fkParty.status === 400 && fkParty.body?.message === "Sale not found",
      fkParty.body
    );

    const shop2SaleId = (await pool.query(`SELECT id FROM sales WHERE shop_id = $1 LIMIT 1`, [created.shopId])).rows[0].id;
    const fkRefund = await api(shop2Token, "POST", `/api/sales/${shop2SaleId}/refunds`, {
      quantity: 1,
      refundAmount: 10,
      refundMethod: "cash",
      condition: "resellable",
      reason: "isolation probe",
      contactId: shop1Contact.id,
    });
    check(
      "Refund can't be attributed to shop 1's contact",
      fkRefund.status === 400 && fkRefund.body?.message === "Contact not found",
      fkRefund.body
    );

    console.log("\n=== Global username uniqueness still works under row-level security ===");
    const { rows: shop1UserRows2 } = await pool.query(`SELECT username FROM users WHERE shop_id = $1 LIMIT 1`, [shop1Id]);
    const dupUser = await api(shop2Token, "POST", "/api/users", {
      username: shop1UserRows2[0].username,
      password: "isolation-pw-123",
      displayName: "Dup probe",
      role: "cashier",
    });
    check(
      "Shop 2 creating a username that exists in shop 1 gets a clean 409 (the check sees across shops)",
      dupUser.status === 409,
      dupUser.body
    );

    console.log("\n=== Phone forwarder: per-shop secret, per-shop matching ===");
    const secretRes = await api(shop2Token, "POST", "/api/bank-payments/webhook/secret");
    const shop2Secret = secretRes.body?.secret;
    check("Owner can generate the shop's forwarder secret", secretRes.status === 201 && !!shop2Secret, secretRes.body);

    // A pending payment in SHOP 1 at an amount shop 2 has nothing pending for.
    const probeAmount = 98765.43;
    const { rows: intentRows } = await pool.query(
      `INSERT INTO bank_payment_intents (status, cart_snapshot, amount, shop_id)
       VALUES ('awaiting_payment', '[]', $1, $2) RETURNING id`,
      [probeAmount, shop1Id]
    );
    created.intentId = intentRows[0].id;

    const forward = (secret, path, body) =>
      fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarder-Secret": secret },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

    const notif = await forward(shop2Secret, "/api/bank-payments/webhook/notification", {
      packageName: "sms",
      text: `Rs ${probeAmount} received from ISOLATION TEST`,
    });
    const { rows: intentAfter } = await pool.query(`SELECT status FROM bank_payment_intents WHERE id = $1`, [created.intentId]);
    check(
      "Shop 2's bank SMS does NOT confirm shop 1's pending payment of the same amount",
      notif.status === 200 && notif.body?.matched === false && intentAfter[0].status === "awaiting_payment",
      { response: notif.body, shop1IntentStatus: intentAfter[0].status }
    );

    // ...while the same phone's SMS DOES still auto-confirm its own shop's pending payment —
    // the matcher's full path (parse -> match -> confirmIntent -> checkoutSale) under shop 2's
    // tenant context, with no logged-in user at all.
    const ownAmount = 4321.5;
    const { rows: ownIntent } = await pool.query(
      `INSERT INTO bank_payment_intents (status, cart_snapshot, amount, shop_id)
       VALUES ('awaiting_payment', $1, $2, $3) RETURNING id`,
      [JSON.stringify([{ productID: plainId, quantity: 1, sellingPrice: ownAmount }]), ownAmount, created.shopId]
    );
    const ownNotif = await forward(shop2Secret, "/api/bank-payments/webhook/notification", {
      packageName: "sms",
      text: `Rs ${ownAmount} received from ISOLATION TEST`,
    });
    const { rows: ownAfter } = await pool.query(`SELECT status, auto_confirmed FROM bank_payment_intents WHERE id = $1`, [
      ownIntent[0].id,
    ]);
    check(
      "Shop 2's bank SMS DOES auto-confirm shop 2's own pending payment",
      ownNotif.body?.outcome === "confirmed" && ownAfter[0].status === "confirmed" && ownAfter[0].auto_confirmed === true,
      { response: ownNotif.body, intent: ownAfter[0] }
    );

    const beat = await forward(shop2Secret, "/api/bank-payments/webhook/heartbeat", {});
    const [status1, status2] = await Promise.all([
      api(shop1Token, "GET", "/api/bank-payments/webhook/status"),
      api(shop2Token, "GET", "/api/bank-payments/webhook/status"),
    ]);
    check(
      "Heartbeat lands on shop 2's own forwarder status, not shop 1's",
      beat.status === 204 && !!status2.body.lastHeartbeatAt && status1.body.lastHeartbeatAt !== status2.body.lastHeartbeatAt,
      { shop1: status1.body, shop2: status2.body }
    );

    const bad = await forward("not-a-real-secret", "/api/bank-payments/webhook/heartbeat", {});
    check("An unknown forwarder secret is rejected", bad.status === 401, bad.body);

    console.log("\n=== Database row-level security (migration 028) ===");
    const { rows: noRls } = await pool.query(
      `SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity`
    );
    check("Every public table has row-level security enabled", noRls.length === 0, noRls);
    const { rows: withDefault } = await pool.query(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'shop_id' AND column_default IS NOT NULL`
    );
    check("No shop_id column silently defaults to a shop", withDefault.length === 0, withDefault);

    // Straight at the database, bypassing every app-level filter: an UNFILTERED query run the
    // way Db.js runs a shop's request must still only see that shop.
    const asShop = async (shopId, sql) => {
      const client = await pool.connect();
      try {
        await client.query(`BEGIN; SET LOCAL ROLE pos_app; SELECT set_config('app.shop_id', '${Number(shopId)}', true)`);
        return await client.query(sql);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    };
    const asShop2 = (sql) => asShop(created.shopId, sql);
    const errorOf = async (run) => {
      try {
        await run();
        return null;
      } catch (e) {
        return e.message;
      }
    };
    const unfiltered = await asShop2(`SELECT DISTINCT shop_id FROM products`);
    check(
      "Unfiltered 'SELECT FROM products' as shop 2 returns only shop 2's rows",
      unfiltered.rows.length === 1 && unfiltered.rows[0].shop_id === created.shopId,
      unfiltered.rows
    );
    let crossInsertError = null;
    try {
      await asShop2(`INSERT INTO categories (category_name, shop_id) VALUES ('rls-probe', ${Number(shop1Id)})`);
    } catch (e) {
      crossInsertError = e.message;
    }
    check("Shop 2 can't insert a row into shop 1 even with raw SQL", /row-level security/.test(crossInsertError || ""), crossInsertError);

    // Platform tables (migration 031). Sign-in history and the admin audit trail are never
    // readable from a shop request; a shop reads only its own subscription payments and
    // only the announcements addressed to every shop or to itself — and writes neither.
    for (const table of ["login_events", "admin_audit_log"]) {
      const denied = await errorOf(() => asShop2(`SELECT COUNT(*) FROM ${table}`));
      check(`A shop request can't read ${table} at all`, /permission denied/.test(denied || ""), denied);
    }
    const { rows: probePayment } = await pool.query(
      `INSERT INTO subscription_payments (shop_id, amount, method, covers_from, covers_until)
       VALUES ($1, 1000, 'cash', CURRENT_DATE, CURRENT_DATE + 30) RETURNING id`,
      [created.shopId]
    );
    created.paymentId = probePayment[0].id;
    // Scheduled far in the future, so no real shop 1 screen ever shows it while the test runs.
    const { rows: probeNotice } = await pool.query(
      `INSERT INTO announcements (title, shop_id, starts_at) VALUES ('rls-probe', $1, NOW() + INTERVAL '10 years') RETURNING id`,
      [shop1Id]
    );
    created.announcementId = probeNotice[0].id;
    const ownPayments = await asShop2(`SELECT shop_id FROM subscription_payments`);
    const otherShopsView = await asShop(shop1Id, `SELECT id FROM subscription_payments WHERE id = ${Number(created.paymentId)}`);
    check(
      "Subscription payments: a shop sees its own, never another shop's",
      ownPayments.rows.length === 1 && ownPayments.rows[0].shop_id === created.shopId && otherShopsView.rows.length === 0,
      { ownPayments: ownPayments.rows, otherShopsView: otherShopsView.rows }
    );
    const paymentWrite = await errorOf(() =>
      asShop2(`UPDATE subscription_payments SET covers_until = covers_until + 365 WHERE shop_id = ${Number(created.shopId)}`)
    );
    check("A shop can't extend its own subscription", /permission denied/.test(paymentWrite || ""), paymentWrite);
    const otherNotice = await asShop2(`SELECT id FROM announcements WHERE id = ${Number(created.announcementId)}`);
    check("An announcement addressed to shop 1 is invisible to shop 2", otherNotice.rows.length === 0, otherNotice.rows);

    // Foreign keys are checked WITHOUT row-level security, so this is the one gap RLS can't
    // close — migration 029's same-shop keys do. Run as the table owner (no RLS at all) to
    // prove it's the schema itself refusing, not any app code.
    let crossLinkError = null;
    try {
      await pool.query(
        `INSERT INTO products (productname, buyingprice, quantity, category_id, shop_id) VALUES ('fk-probe', 1, 1, $1, $2)`,
        [shop1Category.id, created.shopId]
      );
    } catch (e) {
      crossLinkError = e.code;
    }
    check("Schema itself rejects shop 2's product under shop 1's category (same-shop FK)", crossLinkError === "23503", crossLinkError);

    const { rows: anonRole } = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'anon'`);
    if (anonRole.length) {
      const { rows: anon } = await pool.query(`SELECT has_table_privilege('anon', 'public.users', 'SELECT') AS can_read`);
      check("Supabase's public 'anon' role can't read app tables (e.g. password hashes)", anon[0].can_read === false, anon[0]);
    }
  } finally {
    console.log("\n=== Cleanup ===");
    try {
      // Children before parents (FKs): intents/redemptions -> refunds -> sales ->
      // receipts -> shifts, and lots before products/contacts.
      if (created.intentId) await pool.query(`DELETE FROM bank_payment_intents WHERE id = $1`, [created.intentId]);
      if (created.paymentId) await pool.query(`DELETE FROM subscription_payments WHERE id = $1`, [created.paymentId]);
      if (created.announcementId) await pool.query(`DELETE FROM announcements WHERE id = $1`, [created.announcementId]);
      for (const table of [
        "bank_payment_intents",
        "store_credit_redemptions",
        "party_transactions",
        "refunds",
        "stock_adjustments",
        "sales",
        "sale_transactions",
        "shift_cash_movements",
        "shifts",
        "lots",
        "lot_sequences",
      ]) {
        await pool.query(`DELETE FROM ${table} WHERE shop_id = $1`, [created.shopId]);
      }
      await pool.query(`DELETE FROM users WHERE shop_id = $1 AND id <> $2`, [created.shopId, created.userId]);
      await pool.query(`DELETE FROM settings WHERE shop_id = $1`, [created.shopId]);
      // migration 024 (storage quotas + egress): every authenticated request this script
      // makes for shop 2 goes through Server.js's egress-tracking middleware, so by the
      // time cleanup runs there's always at least one row here for it — must go before
      // the shops delete below or that FK rejects it, same reasoning as every other
      // shop_id-scoped table cleaned up here. That middleware's own write is fire-and-
      // forget (Server.js never awaits it), so the very last test request's egress row
      // may not have landed yet — a short wait here lets it settle first.
      await sleep(300);
      await pool.query(`DELETE FROM shop_egress_daily WHERE shop_id = $1`, [created.shopId]);
      await pool.query(`DELETE FROM settings WHERE key = 'isolation_test_key'`);
      for (const id of created.productIds) await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
      for (const id of created.categoryIds) await pool.query(`DELETE FROM categories WHERE id = $1`, [id]);
      for (const id of created.contactIds) await pool.query(`DELETE FROM contacts WHERE id = $1`, [id]);
      if (created.userId) await pool.query(`DELETE FROM users WHERE id = $1`, [created.userId]);
      if (created.shopId) await pool.query(`DELETE FROM shops WHERE id = $1`, [created.shopId]);
      console.log("  Cleaned up all test data.");
    } catch (e) {
      console.error("  CLEANUP FAILED:", e.message);
    }
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) {
    console.log("Failures:", JSON.stringify(failures, null, 2));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("TEST SCRIPT CRASHED:", e);
  process.exit(1);
});
