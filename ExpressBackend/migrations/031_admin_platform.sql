-- Platform admin console, part 2: an audit trail of admin actions, login history (and the
-- failed-login lockout built on it), shop subscriptions, and announcements to shops.
--
-- RLS (migration 028): admin_audit_log and login_events are platform-only — RLS on, nothing
-- granted to pos_app, so no shop request can ever read them. subscription_payments is a
-- shop-owned table the shop may READ (its own paid-until date drives the renewal banner)
-- but never write. announcements belong to the platform; a shop reads the ones addressed to
-- every shop (shop_id NULL) or to itself.
--
-- Timestamps are TIMESTAMP holding UTC wall-clock time, like every other table here (the
-- session timezone is UTC — see Db.js's type parser).
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------------------
-- Who changed what, from the admin console. `details` holds the before/after of the change
-- (e.g. {"from": "basic", "to": "smart"}), never a password.
-- ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  admin_user_id INTEGER REFERENCES users(id),
  action        TEXT NOT NULL,
  shop_id       INTEGER REFERENCES shops(id),
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_shop ON admin_audit_log (shop_id, created_at DESC);

-- ---------------------------------------------------------------------------------------
-- Every sign-in attempt. `username` is what was typed (it may match no account), user_id /
-- shop_id are filled when it does. 'locked' = refused without checking the password because
-- of too many recent failures (Sevices/loginSecurityService.js). A user's last login is
-- derived from here (their latest 'success'), not stored on users.
-- Kept 90 days (the daily maintenance sweep deletes older rows).
-- ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_events (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id),
  shop_id    INTEGER REFERENCES shops(id),
  outcome    TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT login_events_outcome_check CHECK (outcome IN ('success', 'failure', 'locked'))
);
-- Lockout checks: recent attempts for one username / one address.
CREATE INDEX IF NOT EXISTS idx_login_events_username ON login_events (username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_ip ON login_events (ip, created_at DESC);
-- Last login per user, login history per shop, and the time-ordered admin log.
CREATE INDEX IF NOT EXISTS idx_login_events_user_success ON login_events (user_id, created_at DESC) WHERE outcome = 'success';
CREATE INDEX IF NOT EXISTS idx_login_events_shop ON login_events (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events (created_at DESC);

-- ---------------------------------------------------------------------------------------
-- Subscription payments, recorded by the platform admin (shops pay by cash / bank transfer
-- / wallet, outside the app). Each one covers a period; a shop's paid-until date is the
-- latest covers_until across its payments — derived, never stored on shops. A shop with no
-- payments at all isn't billed through this (e.g. an internal/demo shop).
-- 'trial' and 'waiver' are zero-amount periods granted rather than paid for.
-- ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_payments (
  id           SERIAL PRIMARY KEY,
  shop_id      INTEGER NOT NULL REFERENCES shops(id),
  amount       INTEGER NOT NULL,
  method       TEXT NOT NULL,
  covers_from  DATE NOT NULL,
  covers_until DATE NOT NULL,
  reference    TEXT,
  note         TEXT,
  recorded_by  INTEGER REFERENCES users(id),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_payments_amount_check CHECK (amount >= 0),
  CONSTRAINT subscription_payments_period_check CHECK (covers_until > covers_from),
  CONSTRAINT subscription_payments_method_check
    CHECK (method IN ('cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'card', 'other', 'trial', 'waiver'))
);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_shop ON subscription_payments (shop_id, covers_until DESC);

-- ---------------------------------------------------------------------------------------
-- Notices from the platform to shops (maintenance windows, new features, payment
-- reminders). Addressed to every shop (shop_id NULL) or one shop, optionally only one tier.
-- Shown from starts_at until ends_at (NULL = until the admin ends it).
-- ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  level      TEXT NOT NULL DEFAULT 'info',
  shop_id    INTEGER REFERENCES shops(id),
  tier       TEXT,
  starts_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  ends_at    TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT announcements_level_check CHECK (level IN ('info', 'warning', 'critical')),
  CONSTRAINT announcements_tier_check CHECK (tier IS NULL OR tier IN ('basic', 'smart', 'advanced')),
  CONSTRAINT announcements_window_check CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_announcements_window ON announcements (starts_at, ends_at);

-- ---------------------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------------------
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON subscription_payments TO pos_app;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_isolation ON subscription_payments;
CREATE POLICY shop_isolation ON subscription_payments FOR SELECT TO pos_app USING (shop_id = app_shop_id());

GRANT SELECT ON announcements TO pos_app;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_isolation ON announcements;
CREATE POLICY shop_isolation ON announcements FOR SELECT TO pos_app
  USING (shop_id IS NULL OR shop_id = app_shop_id());

-- Supabase's Data API roles (anon/authenticated) get nothing on these either: migration 028
-- revoked their default privileges on every table created after it.
