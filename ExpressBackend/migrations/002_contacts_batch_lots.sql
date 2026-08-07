-- Contacts (customers/vendors), vendor-coded batch lots, per-product batch tracking,
-- sales cost snapshot, credit/debit -> contacts linkage, and perf indexes.
-- Safe to re-run: guarded with IF NOT EXISTS / IF EXISTS / ON CONFLICT where applicable.

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_customer BOOLEAN NOT NULL DEFAULT false,
  is_vendor   BOOLEAN NOT NULL DEFAULT false,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS batch_tracked BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS lots (
  id SERIAL PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  vendor_id     INTEGER REFERENCES contacts(id),
  lot_code      TEXT NOT NULL,
  buying_price  NUMERIC NOT NULL DEFAULT 0,
  qty_received  INTEGER NOT NULL DEFAULT 0,
  qty_remaining INTEGER NOT NULL DEFAULT 0,
  received_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, lot_code)
);
CREATE INDEX IF NOT EXISTS idx_lots_product_id ON lots(product_id);

-- Concurrency-safe per (vendor, product) lot numbering (replaces old `sequences`)
CREATE TABLE IF NOT EXISTS lot_sequences (
  vendor_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vendor_id, product_id)
);

-- Sales: reference the lot sold from, and SNAPSHOT the cost at sale time
-- (fixes the anomaly where changing a product's current price silently rewrote past profit).
ALTER TABLE sales ADD COLUMN IF NOT EXISTS lot_id INTEGER REFERENCES lots(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS buying_price NUMERIC;
UPDATE sales s SET buying_price = p.buyingprice
  FROM products p
  WHERE s.product_id = p.id AND s.buying_price IS NULL;

-- Credit/Debit -> contacts
ALTER TABLE credit ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES contacts(id);
ALTER TABLE debit  ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES contacts(id);

-- Backfill: every distinct existing credit.name becomes a customer contact; debit.name becomes a vendor contact.
INSERT INTO contacts (name, is_customer)
SELECT DISTINCT name, true FROM credit
WHERE name IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.name = credit.name AND c.is_customer);

INSERT INTO contacts (name, is_vendor)
SELECT DISTINCT name, true FROM debit
WHERE name IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.name = debit.name AND c.is_vendor);

UPDATE credit SET contact_id = c.id
  FROM contacts c
  WHERE credit.contact_id IS NULL AND c.name = credit.name AND c.is_customer;

UPDATE debit SET contact_id = c.id
  FROM contacts c
  WHERE debit.contact_id IS NULL AND c.name = debit.name AND c.is_vendor;

-- Perf / search indexes
CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products (LOWER(productname));
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_time ON sales(sale_time);
CREATE INDEX IF NOT EXISTS idx_credit_contact_id ON credit(contact_id);
CREATE INDEX IF NOT EXISTS idx_debit_contact_id ON debit(contact_id);

-- Obsolete per-unit-serial machinery from the previous lot design
ALTER TABLE sales DROP COLUMN IF EXISTS product_unit_id;
DROP TABLE IF EXISTS product_units CASCADE;
DROP TABLE IF EXISTS sequences;
DELETE FROM settings WHERE key = 'lot_tracking_enabled';
