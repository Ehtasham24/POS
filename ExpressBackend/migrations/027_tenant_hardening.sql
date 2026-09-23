-- Tenant hardening, part 1 of 2 (part 2 is 028_row_level_security.sql).
--
-- 1. Drop the `shop_id DEFAULT 1` that migration 021 left in place "until scoping is
--    verified complete". It is now: every INSERT in the app passes shop_id explicitly
--    (checked statement by statement before this migration). With the default still there,
--    any future INSERT that forgot shop_id would have silently filed the row under shop 1 —
--    a real shop — instead of failing. Without it, the NOT NULL constraint makes that a loud
--    error. (users.shop_id stays nullable: a platform superadmin belongs to no shop.)
--
-- 2. Per-shop phone-forwarder secret. The forwarder used to authenticate with one
--    server-wide secret (NOTIFICATION_FORWARDER_SECRET), so the server couldn't tell which
--    shop a bank SMS came from and matched it against every shop's pending payments. Only a
--    SHA-256 of the secret is stored (see Sevices/forwarderSecretService.js for why a plain
--    hash is the right choice for a random 192-bit secret); UNIQUE because the hash is how a
--    webhook call is mapped back to exactly one shop.
--
-- Safe to re-run.

ALTER TABLE bank_payment_intents     ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE categories               ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE contacts                 ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE lot_sequences            ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE lots                     ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE party_transactions       ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE products                 ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE refunds                  ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE sale_transactions        ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE sales                    ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE settings                 ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE shift_cash_movements     ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE shifts                   ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE stock_adjustments        ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE store_credit_redemptions ALTER COLUMN shop_id DROP DEFAULT;
ALTER TABLE users                    ALTER COLUMN shop_id DROP DEFAULT;

ALTER TABLE shops ADD COLUMN IF NOT EXISTS forwarder_secret_hash TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS forwarder_secret_created_at TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_forwarder_secret_hash
  ON shops(forwarder_secret_hash) WHERE forwarder_secret_hash IS NOT NULL;
