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
    const reportAsShop2 = await api(shop2Token, "POST", "/api/Sales", { startDate: startD, endDate: endD });
    const pepsiRowsInShop2Report = reportAsShop2.body.salesData.filter((r) => r.productname === "Pepsi");
    check(
      "Shop 2's sales report shows its own Pepsi sale at its own price (50), not merged with any other shop's",
      pepsiRowsInShop2Report.length === 1 && Number(pepsiRowsInShop2Report[0].avg_selling_price) === 50,
      pepsiRowsInShop2Report
    );
  } finally {
    console.log("\n=== Cleanup ===");
    try {
      await pool.query(`DELETE FROM stock_adjustments WHERE shop_id = $1`, [created.shopId]);
      await pool.query(`DELETE FROM sales WHERE shop_id = $1`, [created.shopId]);
      await pool.query(`DELETE FROM shifts WHERE shop_id = $1`, [created.shopId]);
      await pool.query(`DELETE FROM settings WHERE shop_id = $1`, [created.shopId]);
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
