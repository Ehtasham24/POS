-- Offline registers, phase 1 (plan-offline-sync.md): what the cloud needs before a shop's own
-- devices can sell offline and sync — a record of each device, identities that can't collide
-- between devices, receipt numbers stored rather than derived from a database id, and a feed
-- of every change a device has to pull.
--
-- Additive only: new tables, new columns with defaults, triggers. Nothing existing is renamed
-- or removed, and existing rows keep their receipt and voucher numbers.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------------------
-- How many registers a shop may run, set by the platform admin per shop (like max_users).
-- ---------------------------------------------------------------------------------------
ALTER TABLE shops ADD COLUMN IF NOT EXISTS max_devices INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_max_devices_check;
ALTER TABLE shops ADD CONSTRAINT shops_max_devices_check CHECK (max_devices >= 0);

-- ---------------------------------------------------------------------------------------
-- A shop's registered devices and their sync state. pending_count / oldest_pending_at are
-- what the device last reported (its outbox lives on the device, so the cloud can't derive
-- them); everything else is the cloud's own record.
-- ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  id                UUID PRIMARY KEY,
  shop_id           INTEGER NOT NULL REFERENCES shops(id),
  name              TEXT NOT NULL,
  platform          TEXT NOT NULL CHECK (platform IN ('windows', 'android')),
  receipt_prefix    TEXT NOT NULL,
  token_hash        TEXT NOT NULL,
  registered_by     INTEGER NOT NULL REFERENCES users(id),
  registered_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  app_version       TEXT,
  protocol_version  INTEGER,
  last_seen_at      TIMESTAMP,
  last_push_at      TIMESTAMP,
  last_pull_at      TIMESTAMP,
  last_applied_seq  BIGINT NOT NULL DEFAULT 0,
  pending_count     INTEGER NOT NULL DEFAULT 0,
  oldest_pending_at TIMESTAMP,
  clock_skew_ms     INTEGER,
  last_error        TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired', 'blocked')),
  status_changed_at TIMESTAMP,
  UNIQUE (shop_id, receipt_prefix)
);
CREATE INDEX IF NOT EXISTS idx_devices_shop ON devices (shop_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_token_hash ON devices (token_hash);

-- One row per sync call, kept 30 days (maintenance sweep), so "why didn't this sale arrive"
-- can be answered from the admin console.
CREATE TABLE IF NOT EXISTS sync_log (
  id          BIGSERIAL PRIMARY KEY,
  device_id   UUID NOT NULL REFERENCES devices(id),
  shop_id     INTEGER NOT NULL REFERENCES shops(id),
  direction   TEXT NOT NULL CHECK (direction IN ('push', 'pull', 'snapshot')),
  rows        INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  ok          BOOLEAN NOT NULL,
  error       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_log_device ON sync_log (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON sync_log (created_at);

-- A pushed event the cloud could never apply: kept with its payload for the owner to review,
-- and acknowledged to the device so its queue keeps moving. Nothing is silently dropped.
CREATE TABLE IF NOT EXISTS sync_rejections (
  id          BIGSERIAL PRIMARY KEY,
  device_id   UUID NOT NULL REFERENCES devices(id),
  shop_id     INTEGER NOT NULL REFERENCES shops(id),
  event_uuid  UUID NOT NULL UNIQUE,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sync_rejections_shop ON sync_rejections (shop_id, created_at DESC);

-- ---------------------------------------------------------------------------------------
-- Identities that can't collide between devices. Integer ids stay the cloud's keys; the sync
-- protocol refers to rows only by uuid, and each side maps uuid -> its own id. (settings is
-- keyed by (shop_id, key) and syncs by key.)
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories', 'contacts', 'products', 'lots', 'users', 'shifts',
    'shift_cash_movements', 'sale_transactions', 'sales', 'refunds', 'store_credit_redemptions',
    'party_transactions', 'stock_adjustments']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS uuid UUID NOT NULL DEFAULT gen_random_uuid()', t);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (uuid)', 'idx_' || t || '_uuid', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------
-- Receipt and refund numbers, stored. Until now they were formatted from the row id
-- (RCPT-000123 / REF-000123, the refund number doubling as the store-credit voucher code),
-- which two offline devices would hand out twice. A device writes its own
-- "{prefix}-{counter}" (P1-000045); a row written in the cloud without one gets the old
-- format from its id, so existing receipts and vouchers keep their numbers.
-- ---------------------------------------------------------------------------------------
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS receipt_no TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS receipt_no TEXT;
UPDATE sale_transactions SET receipt_no = 'RCPT-' || lpad(id::text, 6, '0') WHERE receipt_no IS NULL;
UPDATE refunds SET receipt_no = 'REF-' || lpad(id::text, 6, '0') WHERE receipt_no IS NULL;

CREATE OR REPLACE FUNCTION default_receipt_no() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.receipt_no IS NULL THEN
    NEW.receipt_no := TG_ARGV[0] || lpad(NEW.id::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sale_transactions_receipt_no ON sale_transactions;
CREATE TRIGGER trg_sale_transactions_receipt_no BEFORE INSERT ON sale_transactions
  FOR EACH ROW EXECUTE FUNCTION default_receipt_no('RCPT-');
DROP TRIGGER IF EXISTS trg_refunds_receipt_no ON refunds;
CREATE TRIGGER trg_refunds_receipt_no BEFORE INSERT ON refunds
  FOR EACH ROW EXECUTE FUNCTION default_receipt_no('REF-');

ALTER TABLE sale_transactions ALTER COLUMN receipt_no SET NOT NULL;
ALTER TABLE refunds ALTER COLUMN receipt_no SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_transactions_receipt_no ON sale_transactions (shop_id, receipt_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_receipt_no ON refunds (shop_id, receipt_no);

-- ---------------------------------------------------------------------------------------
-- The change feed devices pull from: every insert, update and delete of a synced row, with
-- the writing transaction's id. A pull reads only up to the oldest transaction still running
-- (pg_snapshot_xmin), so a change that commits late is never skipped. Deletes need no soft
-- delete column: the trigger records the deleted row's key. Pruned after 30 days.
-- ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_changes (
  id         BIGSERIAL PRIMARY KEY,
  shop_id    INTEGER NOT NULL,
  table_name TEXT NOT NULL,
  row_key    TEXT NOT NULL,
  op         TEXT NOT NULL CHECK (op IN ('insert', 'update', 'delete')),
  xid        XID8 NOT NULL DEFAULT pg_current_xact_id(),
  changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_changes_shop ON sync_changes (shop_id, id);
CREATE INDEX IF NOT EXISTS idx_sync_changes_changed_at ON sync_changes (changed_at);

-- SECURITY DEFINER: shop requests run as pos_app, which may not write the feed directly.
-- TG_ARGV[0] names the row's key column. Rows with no shop (a platform admin) aren't synced.
CREATE OR REPLACE FUNCTION record_sync_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_data JSONB := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
BEGIN
  IF (row_data ->> 'shop_id') IS NOT NULL THEN
    INSERT INTO sync_changes (shop_id, table_name, row_key, op)
    VALUES ((row_data ->> 'shop_id')::int, TG_TABLE_NAME, row_data ->> TG_ARGV[0], lower(TG_OP));
  END IF;
  RETURN NULL;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories', 'contacts', 'products', 'lots', 'users', 'shifts',
    'shift_cash_movements', 'sale_transactions', 'sales', 'refunds', 'store_credit_redemptions',
    'party_transactions', 'stock_adjustments', 'settings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_sync_change ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_sync_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_sync_change(%L)',
      t, t, CASE WHEN t = 'settings' THEN 'key' ELSE 'uuid' END);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------
-- RLS (migration 028). A shop sees and registers its own devices, and reads its own sync
-- history, rejections and change feed. The feed is written only by the trigger above.
-- ---------------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON devices TO pos_app;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_isolation ON devices;
CREATE POLICY shop_isolation ON devices TO pos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());

GRANT SELECT, INSERT ON sync_log TO pos_app;
GRANT USAGE ON SEQUENCE sync_log_id_seq TO pos_app;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_isolation ON sync_log;
CREATE POLICY shop_isolation ON sync_log TO pos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());

GRANT SELECT, INSERT, UPDATE ON sync_rejections TO pos_app;
GRANT USAGE ON SEQUENCE sync_rejections_id_seq TO pos_app;
ALTER TABLE sync_rejections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_isolation ON sync_rejections;
CREATE POLICY shop_isolation ON sync_rejections TO pos_app
  USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id());

GRANT SELECT ON sync_changes TO pos_app;
ALTER TABLE sync_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_isolation ON sync_changes;
CREATE POLICY shop_isolation ON sync_changes FOR SELECT TO pos_app USING (shop_id = app_shop_id());
