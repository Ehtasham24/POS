-- Platform-level operator role (Super Admin): sits above the shop-scoped owner/cashier
-- roles this app already has. Lets the POS provider onboard a new shop and change its tier
-- through a real API/UI instead of hand-writing SQL against shops/users directly (which is
-- exactly how every shop and tier change has been made up to this point).
--
-- A superadmin belongs to no shop at all -- there is no "platform shop" row invented here,
-- since that would leak into every shop-scoped query/report as a fake tenant. Instead
-- users.shop_id becomes nullable, but ONLY for this one role: the CHECK constraint below
-- still requires every owner/cashier to have one, so nothing about the existing 167-query
-- shop-scoping pass (migration 021) is weakened -- a shop-bound user is still always
-- shop-bound.

ALTER TABLE users ALTER COLUMN shop_id DROP NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'cashier', 'superadmin'));

-- Mutual exclusion, enforced in the schema rather than left to application code alone: a
-- superadmin row can never carry a shop_id, and an owner/cashier row can never be missing
-- one. A bug that tried to create a shop-bound "superadmin" or a shop-less "owner" fails at
-- the INSERT/UPDATE instead of silently producing a user in an impossible state.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_superadmin_no_shop_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_superadmin_no_shop_check
      CHECK ((role = 'superadmin') = (shop_id IS NULL));
  END IF;
END $$;
