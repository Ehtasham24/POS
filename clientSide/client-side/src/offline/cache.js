// Local-mirror reads, shaped to match the existing endpoints exactly (same fields the pages
// already expect) so callers don't care whether the data came from the network or here.
import { apiGet } from "utils/api";
import { query, run, runBatch } from "./db";

// Tries the network first (today's normal path, byte-for-byte unchanged); only reaches into
// the local mirror if that fails — e.g. fetch() rejecting because there's no connection.
export const withFallback = async (networkCall, cacheCall) => {
  try {
    return await networkCall();
  } catch (error) {
    console.warn("Falling back to offline cache:", error.message);
    return await cacheCall();
  }
};

export const getCategories = () => query("SELECT id, category_name FROM categories ORDER BY category_name");

export const getProductsForCategory = (categoryId) =>
  query(
    `SELECT p.*, COUNT(l.id) AS lot_count
     FROM products p
     LEFT JOIN lots l ON l.product_id = p.id AND l.qty_remaining > 0
     WHERE p.category_id = ?
     GROUP BY p.id`,
    [categoryId]
  );

export const getProductLots = (productId) =>
  query("SELECT * FROM lots WHERE product_id = ? ORDER BY id", [productId]);

export const getSettings = async () => {
  const rows = await query("SELECT key, value FROM settings");
  return rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
};

// Mirrors searchService.js's productname/lot_code matching, minus ranking niceties —
// good enough for "find the item to sell" while offline.
export const searchProducts = async (q) => {
  const like = `%${q}%`;
  const byName = await query(
    `SELECT id AS product_id, productname, category_id, batch_tracked, buyingprice, quantity,
            NULL AS lot_id, NULL AS matched_lot_code, NULL AS lot_buying_price, NULL AS lot_qty_remaining
     FROM products WHERE productname LIKE ? LIMIT 20`,
    [like]
  );
  const byLot = await query(
    `SELECT p.id AS product_id, p.productname, p.category_id, p.batch_tracked, p.buyingprice, p.quantity,
            l.id AS lot_id, l.lot_code AS matched_lot_code, l.buying_price AS lot_buying_price, l.qty_remaining AS lot_qty_remaining
     FROM lots l JOIN products p ON p.id = l.product_id
     WHERE l.lot_code LIKE ? LIMIT 20`,
    [like]
  );
  const seen = new Set();
  const results = [];
  for (const row of [...byLot, ...byName]) {
    const key = `${row.product_id}-${row.lot_id || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(row);
    }
  }
  return results.slice(0, 20);
};

// Mirrors inventoryService.js's status/summary computation exactly.
export const getInventory = async () => {
  const settings = await getSettings();
  const threshold = Number(settings.low_stock_threshold) || 10;

  const rows = await query(`
    SELECT
      p.id, p.productname, p.buyingprice, p.quantity, p.category_id, p.batch_tracked,
      c.category_name,
      COUNT(l.id) AS lot_count,
      CASE WHEN p.batch_tracked THEN COALESCE(SUM(l.buying_price * l.qty_remaining), 0)
           ELSE p.quantity * p.buyingprice END AS stock_value
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN lots l ON l.product_id = p.id
    GROUP BY p.id
    ORDER BY p.productname
  `);

  const items = rows.map((row) => {
    let status = "in_stock";
    if (Number(row.quantity) <= 0) status = "out_of_stock";
    else if (Number(row.quantity) < threshold) status = "low_stock";
    return { ...row, isLotTracked: !!row.batch_tracked, status };
  });

  return {
    items,
    summary: {
      totalSkus: items.length,
      totalStockValue: items.reduce((sum, item) => sum + Number(item.stock_value || 0), 0),
      lowStockCount: items.filter((i) => i.status === "low_stock").length,
      outOfStockCount: items.filter((i) => i.status === "out_of_stock").length,
      lowStockThreshold: threshold,
    },
  };
};

// Optimistic local stock decrement for a sale made while offline — purely cosmetic (the
// authoritative decrement happens for real once the queued sale reaches the backend), so the
// cashier isn't shown stale stock for the rest of the offline session.
export const decrementLocalStock = async (productId, quantity, lotId) => {
  // Mirrors lotService.js's decrementLot: a lot sale decrements both the lot's own
  // remaining count AND the product's cached aggregate quantity — leaving the aggregate
  // untouched would show stale (too-high) stock on Inventory/Product List until the next
  // sync, letting a cashier oversell past what's actually left.
  if (lotId) {
    await run("UPDATE lots SET qty_remaining = qty_remaining - ? WHERE id = ?", [quantity, lotId]);
  }
  await run("UPDATE products SET quantity = quantity - ? WHERE id = ?", [quantity, productId]);
};

// Re-fetches the same data these read functions serve, over the network, and overwrites the
// local mirror. Called after a successful sync and periodically while online (syncManager.js)
// — never blocks the UI, and only runs when connectivity is actually confirmed.
export const refreshFromServer = async () => {
  const [categories, products, settingsObj] = await Promise.all([
    apiGet("/categories"),
    apiGet("/products"),
    apiGet("/api/settings"),
  ]);

  const batchTracked = products.filter((p) => p.batch_tracked);
  const lotsByProduct = await Promise.all(
    batchTracked.map((p) => apiGet(`/api/products/${p.id}/lots`).catch(() => []))
  );

  // Single batch: one worker round-trip, one persist-to-IndexedDB at the end — not one
  // per row (a shop with hundreds of products would otherwise mean hundreds of full-DB
  // serializations, exactly the per-write cost the Worker/event-driven design avoids).
  const statements = [
    ["DELETE FROM categories"],
    ["DELETE FROM products"],
    ["DELETE FROM lots"],
    ["DELETE FROM settings"],
  ];
  for (const c of categories) {
    statements.push(["INSERT INTO categories (id, category_name) VALUES (?, ?)", [c.id, c.category_name]]);
  }
  for (const p of products) {
    statements.push([
      "INSERT INTO products (id, productname, buyingprice, quantity, category_id, batch_tracked) VALUES (?, ?, ?, ?, ?, ?)",
      [p.id, p.productname, p.buyingprice, p.quantity, p.category_id, p.batch_tracked ? 1 : 0],
    ]);
  }
  batchTracked.forEach((p, i) => {
    for (const l of lotsByProduct[i]) {
      statements.push([
        "INSERT INTO lots (id, product_id, vendor_id, vendor_name, lot_code, buying_price, qty_received, qty_remaining) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [l.id, l.product_id, l.vendor_id, l.vendor_name, l.lot_code, l.buying_price, l.qty_received, l.qty_remaining],
      ]);
    }
  });
  for (const [key, value] of Object.entries(settingsObj)) {
    statements.push(["INSERT INTO settings (key, value) VALUES (?, ?)", [key, value]]);
  }

  await runBatch(statements);
};
