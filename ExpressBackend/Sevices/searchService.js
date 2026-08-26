const { pool } = require("../Db");

// Powers: the global search bar, the home POS-terminal sell search, and the
// Update Product searchable dropdown. Matches by product name OR lot code.
const searchProducts = async (query, shopId) => {
  const like = `%${query}%`;

  const byName = await pool.query(
    `SELECT p.id AS product_id, p.productname, p.category_id, p.batch_tracked,
            p.buyingprice, p.quantity,
            NULL::int AS lot_id, NULL AS matched_lot_code, NULL::numeric AS lot_buying_price, NULL::int AS lot_qty_remaining
     FROM products p
     WHERE p.shop_id = $2 AND p.productname ILIKE $1
     LIMIT 20`,
    [like, shopId]
  );

  const byLot = await pool.query(
    `SELECT p.id AS product_id, p.productname, p.category_id, p.batch_tracked,
            p.buyingprice, p.quantity,
            l.id AS lot_id, l.lot_code AS matched_lot_code, l.buying_price AS lot_buying_price, l.qty_remaining AS lot_qty_remaining
     FROM lots l
     JOIN products p ON p.id = l.product_id
     WHERE l.shop_id = $2 AND l.lot_code ILIKE $1
     LIMIT 20`,
    [like, shopId]
  );

  const combined = [...byLot.rows, ...byName.rows];
  const seen = new Set();
  const results = [];
  for (const row of combined) {
    const key = `${row.product_id}-${row.lot_id || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(row);
    }
  }
  return results.slice(0, 20);
};

module.exports = { searchProducts };
