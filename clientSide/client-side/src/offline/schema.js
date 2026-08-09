// SQLite (not Postgres) syntax — this mirrors just the columns the core sell-flow pages
// actually read from products/categories/lots/settings, plus a local-only outbox table for
// sales made while offline. Kept intentionally small: this is a read cache + write queue,
// not a full offline replica of the Postgres schema.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  category_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  productname TEXT NOT NULL,
  buyingprice NUMERIC,
  quantity INTEGER,
  category_id INTEGER,
  batch_tracked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_offline_products_category_id ON products(category_id);

CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  vendor_id INTEGER,
  vendor_name TEXT,
  lot_code TEXT,
  buying_price NUMERIC,
  qty_received INTEGER,
  qty_remaining INTEGER
);
CREATE INDEX IF NOT EXISTS idx_offline_lots_product_id ON lots(product_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Outbox: sales made while offline, replayed against the real API on reconnect.
CREATE TABLE IF NOT EXISTS pending_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;
