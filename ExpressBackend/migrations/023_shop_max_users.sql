-- Per-shop user-seat limit, configured by the platform admin (Sevices/adminService.js's
-- updateShopDetails) — separate from the multiUser feature gate (config/features.js), which
-- only answers "can this shop add extra users AT ALL" (Smart+). This answers "how many,"
-- for the shops that can. Default of 5 keeps every existing shop (the seeded Default Shop
-- currently has 2 users) comfortably under the limit with no backfill needed beyond the
-- column default itself.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 5;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_max_users_positive') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_max_users_positive CHECK (max_users > 0);
  END IF;
END $$;
