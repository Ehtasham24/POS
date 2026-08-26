-- Multi-tenancy foundation: every shop in one shared database, one shared schema.
-- This migration is schema-only — no application code changes ship with it. Every table
-- gets a nullable shop_id, backfilled to shop 1, then locked to NOT NULL DEFAULT 1. The
-- DEFAULT is deliberately left in place (not dropped here) so the app keeps working
-- exactly as before while every query gets scoped in a later pass — dropping the default
-- is what turns a forgotten shop_id into a loud error instead of a silent leak, and that
-- should only happen once scoping is verified complete (see the plan's Phase 1.8).
--
-- Perf indexes ship in this same migration, not a "later" one — see the plan's Phase 1B:
-- a single shop's slow query becomes every shop's slow query the moment there's more than
-- one shop, so this can't be an afterthought.
--
-- Safe to re-run: every step is guarded (IF NOT EXISTS / IF EXISTS / a definition check
-- before touching a constraint), matching every migration before this one.

-- ============================================================================
-- 1.1 — shops table
-- ============================================================================

CREATE TABLE IF NOT EXISTS shops (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  tier       TEXT NOT NULL DEFAULT 'basic',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT shops_tier_check CHECK (tier IN ('basic', 'smart', 'advanced'))
);

-- Every row that already exists becomes shop 1's — otherwise every ADD COLUMN below has
-- nothing to backfill against. Advanced, not basic: this install already has every
-- feature in use today (shifts, stock adjustments, lots, contacts, ...) — starting it on
-- basic would lock all of that away the moment tier gating (a later phase) ships.
INSERT INTO shops (id, name, slug, tier)
VALUES (1, 'Default Shop', 'default', 'advanced')
ON CONFLICT (id) DO NOTHING;
SELECT setval('shops_id_seq', GREATEST((SELECT MAX(id) FROM shops), 1));

-- ============================================================================
-- 1.2 — shop_id on every tenant-owned table
-- ============================================================================
-- Three-step pattern throughout: add nullable + FK, backfill to shop 1, then lock to
-- NOT NULL DEFAULT 1. Tables that also need a constraint/PK change (products,
-- categories, lots, settings, lot_sequences) get that handled separately, after their
-- shop_id is populated — see 1.3.

ALTER TABLE products ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE products SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE products ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE categories SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE categories ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE categories ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE sales SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE sales ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE sales ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE sale_transactions SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE sale_transactions ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE sale_transactions ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE refunds SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE refunds ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE refunds ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE lots ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE lots SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE lots ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE lots ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE lot_sequences ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE lot_sequences SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE lot_sequences ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE lot_sequences ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE contacts SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE contacts ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE contacts ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE party_transactions ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE party_transactions SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE party_transactions ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE party_transactions ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE store_credit_redemptions ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE store_credit_redemptions SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE store_credit_redemptions ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE store_credit_redemptions ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE bank_payment_intents ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE bank_payment_intents SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE bank_payment_intents ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE bank_payment_intents ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE shifts SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE shifts ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE shifts ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE shift_cash_movements ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE shift_cash_movements SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE shift_cash_movements ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE shift_cash_movements ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE stock_adjustments SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE stock_adjustments ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE stock_adjustments ALTER COLUMN shop_id SET DEFAULT 1;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE settings SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE settings ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE settings ALTER COLUMN shop_id SET DEFAULT 1;

-- users.shop_id: how a user's own shop is resolved on login and on every subsequent
-- request (requireAuth) — see the plan's 1.5/1.6. users.username stays globally
-- unique on purpose (a deliberate decision, not an oversight): login only ever supplies
-- a username, no shop is chosen at login, so the shop comes from the user's own row.
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE users SET shop_id = 1 WHERE shop_id IS NULL;
ALTER TABLE users ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE users ALTER COLUMN shop_id SET DEFAULT 1;

-- credit/debit: dead tables. party_transactions (migration 005) replaced them; nothing
-- in the service layer reads or writes either one anymore, and every row that existed
-- in them was already migrated into party_transactions as an opening-balance charge/
-- payment pair (verified against this database before writing this migration — every
-- credit/debit row has its matching party_transactions rows). Giving them a shop_id
-- would just carry two more landmines into multi-tenancy for no reason; drop instead.
DROP TABLE IF EXISTS credit;
DROP TABLE IF EXISTS debit;

-- ============================================================================
-- 1.3 — six landmines: constraints that were correct for one shop, wrong for many
-- ============================================================================
-- Each of these is checked against its live definition and only touched if it doesn't
-- already match — so re-running this migration doesn't drop/recreate a constraint that's
-- already correct.

-- Landmine 1: two shops could never both sell "Pepsi" — not in a migration file at all,
-- found only by auditing the live database (products/categories predate the migration
-- system here).
DO $$
DECLARE current_def TEXT;
BEGIN
  -- Checked against the NEW constraint's own definition, not the old one's — otherwise
  -- a second run would see the old name gone (already dropped) and treat that as "not
  -- done yet," dropping and recreating the already-correct new constraint every time.
  SELECT pg_get_constraintdef(oid) INTO current_def
  FROM pg_constraint WHERE conname = 'products_shop_id_productname_key';
  IF current_def IS DISTINCT FROM 'UNIQUE (shop_id, productname)' THEN
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_productname_key;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_shop_id_productname_key;
    ALTER TABLE products ADD CONSTRAINT products_shop_id_productname_key UNIQUE (shop_id, productname);
  END IF;
END $$;

-- Landmine 2: same story for categories — two shops could never both have "Drinks".
DO $$
DECLARE current_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
  FROM pg_constraint WHERE conname = 'categories_shop_id_category_name_key';
  IF current_def IS DISTINCT FROM 'UNIQUE (shop_id, category_name)' THEN
    ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_category_name_key;
    ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_shop_id_category_name_key;
    ALTER TABLE categories ADD CONSTRAINT categories_shop_id_category_name_key UNIQUE (shop_id, category_name);
  END IF;
END $$;

-- Landmine 3: lot_code was unique globally (needed for the code-only scan-to-sell
-- lookup) — a second shop couldn't generate a lot code another shop already had, and
-- getLotByCode's global lookup could hand one shop's scan back another shop's lot.
-- Both the global UNIQUE(lot_code) and the older UNIQUE(product_id, lot_code) are
-- dropped in favor of one UNIQUE(shop_id, lot_code).
DO $$
DECLARE current_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
  FROM pg_constraint WHERE conname = 'lots_shop_id_lot_code_key';
  IF current_def IS DISTINCT FROM 'UNIQUE (shop_id, lot_code)' THEN
    ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_lot_code_key;
    ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_product_id_lot_code_key;
    ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_shop_id_lot_code_key;
    ALTER TABLE lots ADD CONSTRAINT lots_shop_id_lot_code_key UNIQUE (shop_id, lot_code);
  END IF;
END $$;

-- Landmine 4: settings' PK was just (key) — every shop would have shared one timezone,
-- one low-stock threshold.
DO $$
DECLARE current_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
  FROM pg_constraint WHERE conname = 'settings_pkey';
  IF current_def IS DISTINCT FROM 'PRIMARY KEY (shop_id, key)' THEN
    ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
    ALTER TABLE settings ADD CONSTRAINT settings_pkey PRIMARY KEY (shop_id, key);
  END IF;
END $$;

-- Landmine 5: users.username — deliberately left GLOBAL, not made (shop_id, username).
-- Confirmed decision: login only ever takes a username (no shop is chosen at login), so
-- two shops can't share a username (e.g. two shops both wanting "admin") — a real, known
-- cost of this login design, not an oversight. See the plan's 1.6 for the mitigation
-- (email-style usernames, or a shop-slug prefix at user-creation time) — that's an
-- application-layer decision for a later phase, not a schema change.

-- Landmine 6: lot_sequences' PK was (vendor_id, product_id) — the lot-numbering counter
-- would have been shared across every shop using the same vendor/product combination.
DO $$
DECLARE current_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
  FROM pg_constraint WHERE conname = 'lot_sequences_pkey';
  IF current_def IS DISTINCT FROM 'PRIMARY KEY (shop_id, vendor_id, product_id)' THEN
    ALTER TABLE lot_sequences DROP CONSTRAINT IF EXISTS lot_sequences_pkey;
    ALTER TABLE lot_sequences ADD CONSTRAINT lot_sequences_pkey PRIMARY KEY (shop_id, vendor_id, product_id);
  END IF;
END $$;

-- ============================================================================
-- 1.7 — views: shop_id has to be threaded through by hand, "grep FROM products" never
-- finds this. All three are dropped and recreated (not CREATE OR REPLACE) since shop_id
-- is a genuinely new output column, not an appended one, and nothing else in this
-- database depends on any of the three.
-- ============================================================================

DROP VIEW IF EXISTS party_balances;
CREATE VIEW party_balances AS
SELECT shop_id, contact_id, direction,
       SUM(CASE WHEN kind = 'payment' THEN -amount ELSE amount END) AS balance,
       SUM(CASE WHEN kind = 'charge'  THEN amount ELSE 0 END)       AS total_charged,
       SUM(CASE WHEN kind = 'payment' THEN amount ELSE 0 END)       AS total_paid,
       MAX(occurred_on) AS last_activity_on,
       COUNT(*)         AS transaction_count
FROM party_transactions
GROUP BY shop_id, contact_id, direction;

DROP VIEW IF EXISTS sales_ledger;
CREATE VIEW sales_ledger AS
SELECT s.id AS sale_id, s.shop_id, s.product_id, s.sale_time AS event_time, s.quantity,
       s.selling_price, s.buying_price, s.transaction_id
FROM sales s
WHERE s.is_voided = false
UNION ALL
SELECT r.sale_id, s.shop_id, s.product_id, r.refunded_at AS event_time,
       -r.quantity AS quantity,
       r.refund_amount / r.quantity::numeric AS selling_price,
       s.buying_price, s.transaction_id
FROM refunds r
JOIN sales s ON r.sale_id = s.id
WHERE s.is_voided = false;

DROP VIEW IF EXISTS store_credit_voucher_balances;
CREATE VIEW store_credit_voucher_balances AS
SELECT r.id AS refund_id, r.shop_id, r.refund_amount AS initial_amount, r.contact_id,
       r.refunded_at,
       r.refund_amount - COALESCE(SUM(red.amount), 0::numeric) AS balance
FROM refunds r
LEFT JOIN store_credit_redemptions red ON red.refund_id = r.id
WHERE r.refund_method = 'store_credit'::text
GROUP BY r.id, r.shop_id;

-- ============================================================================
-- 1B.1 — composite indexes: every query now carries WHERE shop_id = $1, so every index
-- that serves a filter or a sort needs shop_id as its LEADING column. An index on
-- shop_id alone isn't enough — Postgres would still have to filter/sort the rest by hand.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sales_shop_sale_time ON sales(shop_id, sale_time);
CREATE INDEX IF NOT EXISTS idx_sales_shop_product_id ON sales(shop_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_shop_adjusted_at ON stock_adjustments(shop_id, adjusted_at);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_shop_product_id ON stock_adjustments(shop_id, product_id);
CREATE INDEX IF NOT EXISTS idx_party_transactions_shop_occurred_on ON party_transactions(shop_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_party_transactions_shop_contact_direction ON party_transactions(shop_id, contact_id, direction);
CREATE INDEX IF NOT EXISTS idx_bank_payment_intents_shop_status ON bank_payment_intents(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_payment_intents_shop_created_at ON bank_payment_intents(shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shifts_shop_status ON shifts(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_products_shop_category_id ON products(shop_id, category_id);
CREATE INDEX IF NOT EXISTS idx_lots_shop_product_id ON lots(shop_id, product_id);
CREATE INDEX IF NOT EXISTS idx_contacts_shop_vendor_name ON contacts(shop_id, name) WHERE is_vendor = true;
CREATE INDEX IF NOT EXISTS idx_contacts_shop_customer_name ON contacts(shop_id, name) WHERE is_customer = true;

-- Every shop_id column not already covered by one of the composites above still needs
-- an index of its own — Postgres never indexes a foreign key automatically, and any join
-- back to shops (or a plain "this shop's rows" filter) on these tables would otherwise
-- be a sequential scan. categories/settings/lot_sequences aren't listed here: settings
-- and lot_sequences already have shop_id as the leading column of their new PK (above),
-- and categories is covered below alongside the others still missing one.
CREATE INDEX IF NOT EXISTS idx_categories_shop_id ON categories(shop_id);
CREATE INDEX IF NOT EXISTS idx_sale_transactions_shop_id ON sale_transactions(shop_id);
CREATE INDEX IF NOT EXISTS idx_refunds_shop_id ON refunds(shop_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_redemptions_shop_id ON store_credit_redemptions(shop_id);
CREATE INDEX IF NOT EXISTS idx_shift_cash_movements_shop_id ON shift_cash_movements(shop_id);
CREATE INDEX IF NOT EXISTS idx_users_shop_id ON users(shop_id);

-- ============================================================================
-- 1B.2 — trigram search: a plain GIN index can't take shop_id as a leading column the
-- way a btree can, so "WHERE shop_id = $1 AND productname ILIKE '%...%'" would otherwise
-- scan every shop's matching rows before filtering down to one shop. btree_gin lets a
-- GIN index mix a plain equality column with a trigram one.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gin;

CREATE INDEX IF NOT EXISTS idx_products_shop_name_trgm
  ON products USING gin (shop_id, productname gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_lots_shop_code_trgm
  ON lots USING gin (shop_id, lot_code gin_trgm_ops);

-- ============================================================================
-- 1B.6 — drop what's now redundant. Every extra index costs write latency on every
-- INSERT/UPDATE (checkout is this app's most write-heavy path), so the old single-column
-- indexes superseded by a composite above come out in the same migration that adds it —
-- not "later."
-- ============================================================================

-- Superseded by the composite indexes added in 1B.1.
DROP INDEX IF EXISTS idx_sales_sale_time;
DROP INDEX IF EXISTS idx_sales_product_id;
DROP INDEX IF EXISTS idx_stock_adjustments_adjusted_at;
DROP INDEX IF EXISTS idx_stock_adjustments_product_id;
DROP INDEX IF EXISTS idx_party_transactions_occurred_on;
DROP INDEX IF EXISTS idx_party_transactions_contact_direction;
DROP INDEX IF EXISTS idx_bank_payment_intents_status;
DROP INDEX IF EXISTS idx_bank_payment_intents_created_at;
DROP INDEX IF EXISTS idx_shifts_status;
DROP INDEX IF EXISTS idx_products_category_id;
DROP INDEX IF EXISTS idx_lots_product_id;
DROP INDEX IF EXISTS idx_contacts_vendor_name;
DROP INDEX IF EXISTS idx_contacts_customer_name;

-- Superseded by the shop-aware trigram indexes added in 1B.2.
DROP INDEX IF EXISTS idx_products_productname_trgm;
DROP INDEX IF EXISTS idx_lots_lot_code_trgm;

-- idx_lots_lot_code duplicated the index Postgres already builds for the UNIQUE
-- constraint on lot_code — paid for on every write, useful to nobody. That UNIQUE
-- constraint itself was already dropped in the Landmine 3 fix above, alongside this
-- plain duplicate.
DROP INDEX IF EXISTS idx_lots_lot_code;

-- idx_products_name_lower (lower(productname)) and products_productname_key (plain
-- productname) served the same case-sensitive-lookup purpose; the new
-- products_shop_id_productname_key UNIQUE constraint (Landmine 1 fix) already carries
-- its own index for exact-match lookups, so the standalone lower() index is now the
-- one with nothing left depending on it.
DROP INDEX IF EXISTS idx_products_name_lower;

-- idx_credit_name_trgm / idx_debit_name_trgm aren't dropped explicitly — they went away
-- automatically with their tables (credit/debit, dropped in 1.2 above).
