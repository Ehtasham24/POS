const { pool } = require("../Db");
const { getSettings } = require("./settingsService");

const getInventory = async () => {
  const settings = await getSettings();
  const threshold = Number(settings.low_stock_threshold) || 10;

  // For batch-tracked products, stock value is the sum of each lot's own buying price times
  // its remaining quantity (lots can carry different costs); simple products just use
  // quantity * buyingprice as before.
  const result = await pool.query(`
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
    LEFT JOIN lots l ON l.product_id = p.id
    GROUP BY p.id, c.category_name
    ORDER BY p.productname
  `);

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
};

module.exports = { getInventory };
