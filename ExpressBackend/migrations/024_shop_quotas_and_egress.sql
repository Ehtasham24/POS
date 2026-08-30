-- Per-shop storage quota (admin-configured "you get N GB of this shared database") and a
-- real, measured egress log — both needed for the platform admin's usage/monitoring view
-- and for the shop-facing "you're near your limit" warning.

-- NULL = no quota configured. Deliberately not defaulted to some arbitrary number —
-- every existing shop starts untracked/unlimited until an admin actually sets one, rather
-- than silently imposing a limit nobody chose.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_storage_quota_positive') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_storage_quota_positive
      CHECK (storage_quota_bytes IS NULL OR storage_quota_bytes > 0);
  END IF;
END $$;

-- One row per shop per calendar day, accumulated by Server.js's egress-tracking middleware
-- (every response's Content-Length, attributed to req.shop.id) — a real measurement of
-- bytes actually sent back to that shop's clients, not an estimate. Kept daily (not one
-- running total) so the admin usage view can show a recent window (e.g. last 30 days)
-- without that number growing meaningless over a shop's entire lifetime.
CREATE TABLE IF NOT EXISTS shop_egress_daily (
  shop_id        INTEGER NOT NULL REFERENCES shops(id),
  day            DATE NOT NULL,
  bytes          BIGINT NOT NULL DEFAULT 0,
  request_count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, day)
);
CREATE INDEX IF NOT EXISTS idx_shop_egress_daily_day ON shop_egress_daily(day);
