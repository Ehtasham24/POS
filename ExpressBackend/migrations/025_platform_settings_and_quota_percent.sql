-- Fixes a real design flaw from migration 024: an admin-entered absolute byte quota per
-- shop had no relationship to what the database actually CAN hold (Supabase's plan tier),
-- so "10 GB" was typed in against a database whose real total is 500 MB (Free tier) — the
-- quota meant nothing. The fix: one platform-wide "how big is our actual database" setting,
-- and every shop's quota is a PERCENTAGE of that — so "Pak home appliances gets 10%" always
-- means 10% of whatever the real total is, and upgrading the Supabase plan later
-- automatically rescales every shop's effective quota with it, no per-shop update needed.

-- Platform-wide, not shop-scoped — deliberately a separate table from the existing
-- shop-scoped `settings` (key, shop_id) rather than reusing it with a NULL shop_id, so a
-- query mistake can never mix a platform setting into a per-shop settings read.
CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Supabase has no queryable "what plan am I on" answer from inside Postgres itself (that's
-- account/billing-level, on Supabase's own side, not exposed to a query run against the
-- database) — so this is admin-entered, based on whatever their actual Supabase plan is.
-- Free tier (500 MB database) is seeded as the honest, safe default rather than something
-- arbitrary like 10 GB, so a platform admin who never touches this setting still gets
-- quota percentages that mean something real.
INSERT INTO platform_settings (key, value)
VALUES ('total_db_capacity_bytes', '524288000') -- 500 MB
ON CONFLICT (key) DO NOTHING;

-- Replaces the flat byte quota from migration 024 — a shop's quota is now always relative
-- to platform_settings' total, never an absolute number an admin has to keep in sync with
-- reality by hand.
ALTER TABLE shops DROP COLUMN IF EXISTS storage_quota_bytes;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS storage_quota_percent NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_storage_quota_percent_range') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_storage_quota_percent_range
      CHECK (storage_quota_percent IS NULL OR (storage_quota_percent > 0 AND storage_quota_percent <= 100));
  END IF;
END $$;
