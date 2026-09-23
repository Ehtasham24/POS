-- Tenant hardening, part 2 of 2: row-level security as a second wall behind the app's own
-- shop_id filters.
--
-- How it's used (ExpressBackend/Db.js): while a request is running for a shop, each
-- transaction starts with
--     BEGIN; SET LOCAL ROLE pos_app; SELECT set_config('app.shop_id', '<id>', true)
-- and the policies below then hide every row whose shop_id isn't that shop's — for reads
-- AND writes (WITH CHECK stops a row being inserted/moved into another shop). Both settings
-- are transaction-local, which is what makes this safe on Supabase's transaction-mode
-- pooler. Anything outside a shop request (login, platform admin, background sweeps) keeps
-- running as the connection's own role, unaffected.
--
-- Deliberately NO default privileges for pos_app: a table added later gets no access at
-- all until a migration grants it AND gives it a policy — so a forgotten policy fails loudly
-- ("permission denied") instead of quietly exposing every shop's rows. Checklist for a new
-- shop-owned table: shop_id NOT NULL (no default), then add it to tenant_tables below.
-- scripts/verify-shop-isolation.js fails if any public table is missing RLS.
--
-- Also closes Supabase's Data API (PostgREST) on these tables. Supabase grants its `anon`
-- and `authenticated` roles full access to every table in `public` by default and relies on
-- RLS to restrict them; with RLS off, anyone holding the project's anon key — which Supabase
-- treats as public — could read every table, password hashes included. This app never uses
-- that API, so both roles lose all access to app tables here.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------------------
-- The role requests run as. NOLOGIN: it's only ever reached through SET LOCAL ROLE from the
-- app's own connection, never logged into directly.
-- ---------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_app') THEN
    CREATE ROLE pos_app NOLOGIN NOBYPASSRLS;
  END IF;
  -- The app's own connection role must be a member to SET ROLE into it.
  EXECUTE format('GRANT pos_app TO %I', current_user);
END $$;

GRANT USAGE ON SCHEMA public TO pos_app;
-- SERIAL ids: INSERTs as pos_app need nextval() on the id sequences, which is USAGE alone.
-- Not UPDATE: that would also allow setval() on id sequences every shop shares, letting one
-- shop's request reset them and break every other shop's inserts.
REVOKE SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public FROM pos_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pos_app;

-- The current request's shop. NULL when unset, which matches no row — so a pos_app
-- transaction that somehow never got a shop sees nothing, rather than everything.
CREATE OR REPLACE FUNCTION app_shop_id() RETURNS integer
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.shop_id', true), '')::integer $$;

-- ---------------------------------------------------------------------------------------
-- Every shop-owned table: full read/write for pos_app, limited to the current shop's rows.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'bank_payment_intents', 'categories', 'contacts', 'lot_sequences', 'lots',
    'party_transactions', 'products', 'refunds', 'sale_transactions', 'sales', 'settings',
    'shift_cash_movements', 'shifts', 'shop_egress_daily', 'stock_adjustments',
    'store_credit_redemptions', 'users'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO pos_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS shop_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY shop_isolation ON %I TO pos_app
         USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id())',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------
-- shops: a shop can read only its own row, and change only its forwarder secret. Tier,
-- quota, active flag, name — all platform-admin only, which never runs as pos_app.
-- ---------------------------------------------------------------------------------------
GRANT SELECT ON shops TO pos_app;
GRANT UPDATE (forwarder_secret_hash, forwarder_secret_created_at) ON shops TO pos_app;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_shop ON shops;
CREATE POLICY own_shop ON shops TO pos_app
  USING (id = app_shop_id()) WITH CHECK (id = app_shop_id());

-- platform_settings: global (e.g. total DB capacity for the storage-quota math), read-only.
GRANT SELECT ON platform_settings TO pos_app;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS read_only ON platform_settings;
CREATE POLICY read_only ON platform_settings FOR SELECT TO pos_app USING (true);

-- password_reset_requests: only the public forgot-password route and the platform admin
-- touch it, neither as pos_app — so pos_app gets no grant at all. RLS on (with no policy)
-- still matters: it's what shuts out Supabase's anon role.
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- Views: by default a view runs with its OWNER's rights, which bypass RLS entirely —
-- reading party_balances as pos_app would have returned every shop's balances.
-- security_invoker makes the underlying tables' policies apply to whoever is querying.
-- ---------------------------------------------------------------------------------------
ALTER VIEW party_balances SET (security_invoker = true);
ALTER VIEW sales_ledger SET (security_invoker = true);
ALTER VIEW store_credit_voucher_balances SET (security_invoker = true);
GRANT SELECT ON party_balances, sales_ledger, store_credit_voucher_balances TO pos_app;

-- ---------------------------------------------------------------------------------------
-- Supabase Data API roles: no access to app tables, now or for tables created later.
-- Skipped on a plain Postgres install, where these roles don't exist.
-- ---------------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END $$;
