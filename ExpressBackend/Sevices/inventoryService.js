const { pool } = require("../Db");
const { getSettings } = require("./settingsService");
const { withCache } = require("../utils/cache");

// This is a heavy aggregate (products x categories x lots, GROUP BY) and it's polled
// every 60s by LowStockBell — globally, on every logged-in page, for every open tab
// (see clientSide LowStockBell.jsx) — plus loaded by the Inventory page itself. Unlike
// categories/settings, stock changes constantly (every sale, every restock), and it has
// many write paths (sales, voids/refunds, lot add-stock, product create/update/delete),
// so rather than chase invalidation through all of them, this just caches for 30s — well
// under the 60s poll interval, so it still absorbs the bulk of the polling traffic
// without ever being more than 30s stale.
// Keyed per-shop — otherwise the 30s cache would serve one shop's stock summary to
// another for up to 30 seconds after the first request from either.
const inventoryCacheKey = (shopId) => `inventory:summary:${shopId}`;
const INVENTORY_CACHE_TTL_SECONDS = 30;

const getInventory = async (shopId) => {
  return withCache(inventoryCacheKey(shopId), INVENTORY_CACHE_TTL_SECONDS, async () => {
    const settings = await getSettings(shopId);
    const threshold = Number(settings.low_stock_threshold) || 10;

    // For batch-tracked products, stock value is the sum of each lot's own buying price times
    // its remaining quantity (lots can carry different costs); simple products just use
    // quantity * buyingprice as before.
    const result = await pool.query(
      `
      SELECT
        p.id,
        p.productname,
        p.buyingprice,
        p.quantity,
        p.category_id,
        p.batch_tracked,
        c.category_name,
        COUNT(l.id) AS lot_count,
        CASE
          WHEN p.batch_tracked THEN COALESCE(SUM(l.buying_price * l.qty_remaining), 0)
          ELSE p.quantity * p.buyingprice
        END AS stock_value
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN lots l ON l.product_id = p.id AND l.shop_id = p.shop_id
      WHERE p.shop_id = $1
      GROUP BY p.id, c.category_name
      ORDER BY p.productname
    `,
      [shopId]
    );

    const items = result.rows.map((row) => {
      let status = "in_stock";
      if (Number(row.quantity) <= 0) status = "out_of_stock";
      else if (Number(row.quantity) < threshold) status = "low_stock";

      return {
        ...row,
        isLotTracked: row.batch_tracked,
        status,
      };
    });

    const summary = {
      totalSkus: items.length,
      totalStockValue: items.reduce((sum, item) => sum + Number(item.stock_value || 0), 0),
      lowStockCount: items.filter((item) => item.status === "low_stock").length,
      outOfStockCount: items.filter((item) => item.status === "out_of_stock").length,
      lowStockThreshold: threshold,
    };

    return { items, summary };
  });
};

module.exports = { getInventory };
