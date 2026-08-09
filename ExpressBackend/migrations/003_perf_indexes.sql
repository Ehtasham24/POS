-- Performance indexes covering the query patterns actually used across the services
-- (exact lookups, FK joins, and ILIKE '%...%' search) that weren't indexed yet.
-- Safe to re-run: everything is guarded with IF NOT EXISTS.

-- ILIKE '%text%' (global search, POS sell search, Update Product picker) can't use a
-- plain btree index no matter what — only a trigram index accelerates "contains" search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- lots: exact-match lookup by barcode/lot code (getLotByCode — hit on every scan during
-- checkout) had no usable index; the existing unique index is on (product_id, lot_code),
-- which can't serve a lot_code-only lookup. vendor_id is an unindexed FK.
CREATE INDEX IF NOT EXISTS idx_lots_lot_code ON lots(lot_code);
CREATE INDEX IF NOT EXISTS idx_lots_vendor_id ON lots(vendor_id);
CREATE INDEX IF NOT EXISTS idx_lots_lot_code_trgm ON lots USING gin (lot_code gin_trgm_ops);

-- products: productname substring search (search bar) — same reasoning as lot_code above.
CREATE INDEX IF NOT EXISTS idx_products_productname_trgm ON products USING gin (productname gin_trgm_ops);

-- sales: lot_id is an unindexed FK (joined in Sales History's billed-history query).
CREATE INDEX IF NOT EXISTS idx_sales_lot_id ON sales(lot_id);

-- contacts: vendor/customer dropdowns filter by one of these booleans then sort by name —
-- a partial index (only rows matching the flag) serves both the filter and the sort.
CREATE INDEX IF NOT EXISTS idx_contacts_vendor_name ON contacts(name) WHERE is_vendor = true;
CREATE INDEX IF NOT EXISTS idx_contacts_customer_name ON contacts(name) WHERE is_customer = true;

-- credit/debit: legacy name-based lookups (fetchCreditByName etc.) use ILIKE '%name%'.
CREATE INDEX IF NOT EXISTS idx_credit_name_trgm ON credit USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_debit_name_trgm ON debit USING gin (name gin_trgm_ops);
