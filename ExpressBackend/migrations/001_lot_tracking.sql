-- Additive migration: lot/serial number tracking, settings, search support.
-- Safe to re-run: everything is guarded with IF NOT EXISTS / ON CONFLICT.

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings(key, value) VALUES ('lot_tracking_enabled', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings(key, value) VALUES ('low_stock_threshold', '10') ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS sequences (
  prefix      TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_units (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lot_no     TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'in_stock',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sold_at    TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_product_units_product_id ON product_units(product_id);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS product_unit_id INTEGER REFERENCES product_units(id);
