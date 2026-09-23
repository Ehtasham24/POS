-- Tenant hardening, part 3: make it impossible at the schema level for one shop's row to
-- point at another shop's row.
--
-- Row-level security (028) doesn't cover this: Postgres deliberately checks foreign keys
-- WITHOUT applying RLS, so shop A could still create a product under shop B's category id,
-- or a refund naming shop B's contact — and any later JOIN on that link reads shop B's
-- data back out. utils/shopOwnership.js checks this in the app; these constraints make the
-- database enforce it too, for every write path, including ones added later.
--
-- How: each shop-owned parent gets UNIQUE (shop_id, id), and each child's single-column
-- foreign key is replaced by a composite one, e.g.
--     FOREIGN KEY (shop_id, category_id) REFERENCES categories (shop_id, id)
-- which only matches a parent row in the SAME shop. It also still proves the parent
-- exists, so the old single-column key is redundant and dropped. MATCH SIMPLE (the
-- default) means a NULL reference (an optional contact, a non-lot sale) isn't checked,
-- same as before. The ON DELETE behavior of each old key is kept.
--
-- Not included: references to users (sold_by, closed_by, ...). Those ids always come from
-- the logged-in session, never a request body, and a platform superadmin (shop_id NULL)
-- can legitimately appear as an actor, which a same-shop constraint would reject.
--
-- Checked before writing this: no existing row violates any of these (0 cross-shop links).
-- Safe to re-run.

-- Parents: (shop_id, id) must be unique for a composite key to reference it. id alone is
-- already the primary key, so this never rejects a row — it only enables the reference.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories', 'contacts', 'lots', 'products', 'refunds', 'sale_transactions', 'sales', 'shifts'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_shop_id_id_key') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (shop_id, id)', t, t || '_shop_id_id_key');
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  -- child table, referencing column, parent table, ON DELETE action
  rel text[];
  rels text[][] := ARRAY[
    ['products',                 'category_id',    'categories',        'NO ACTION'],
    ['sales',                    'lot_id',         'lots',              'NO ACTION'],
    ['sales',                    'product_id',     'products',          'NO ACTION'],
    ['sales',                    'transaction_id', 'sale_transactions', 'NO ACTION'],
    ['lots',                     'product_id',     'products',          'CASCADE'],
    ['lots',                     'vendor_id',      'contacts',          'NO ACTION'],
    ['party_transactions',       'contact_id',     'contacts',          'NO ACTION'],
    ['party_transactions',       'lot_id',         'lots',              'NO ACTION'],
    ['party_transactions',       'sale_id',        'sales',             'NO ACTION'],
    ['sale_transactions',        'contact_id',     'contacts',          'NO ACTION'],
    ['sale_transactions',        'shift_id',       'shifts',            'NO ACTION'],
    ['refunds',                  'contact_id',     'contacts',          'NO ACTION'],
    ['refunds',                  'sale_id',        'sales',             'NO ACTION'],
    ['refunds',                  'shift_id',       'shifts',            'NO ACTION'],
    ['refunds',                  'transaction_id', 'sale_transactions', 'NO ACTION'],
    ['store_credit_redemptions', 'refund_id',      'refunds',           'NO ACTION'],
    ['store_credit_redemptions', 'transaction_id', 'sale_transactions', 'NO ACTION'],
    ['bank_payment_intents',     'transaction_id', 'sale_transactions', 'NO ACTION'],
    ['shift_cash_movements',     'contact_id',     'contacts',          'NO ACTION'],
    ['shift_cash_movements',     'shift_id',       'shifts',            'NO ACTION'],
    ['stock_adjustments',        'lot_id',         'lots',              'NO ACTION'],
    ['stock_adjustments',        'product_id',     'products',          'NO ACTION']
  ];
  new_name text;
BEGIN
  FOREACH rel SLICE 1 IN ARRAY rels LOOP
    new_name := rel[1] || '_' || rel[2] || '_same_shop_fkey';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = new_name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (shop_id, %I) REFERENCES %I (shop_id, id) ON DELETE %s',
        rel[1], new_name, rel[2], rel[3], rel[4]
      );
    END IF;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', rel[1], rel[1] || '_' || rel[2] || '_fkey');
  END LOOP;
END $$;
