-- Device side of cloud migration 032: stable uuids on synced rows, stored receipt and refund
-- numbers, and the shop's device limit. (The cloud-only parts — devices, sync log, change
-- feed — have no place in a device's database.) Runs inside one transaction (localDb.js).
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

ALTER TABLE shops ADD COLUMN IF NOT EXISTS max_devices INTEGER NOT NULL DEFAULT 1;

-- Rows made before this device numbered its own receipts keep the old id-based format.
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS receipt_no TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS receipt_no TEXT;
UPDATE sale_transactions SET receipt_no = 'RCPT-' || lpad(id::text, 6, '0') WHERE receipt_no IS NULL;
UPDATE refunds SET receipt_no = 'REF-' || lpad(id::text, 6, '0') WHERE receipt_no IS NULL;
ALTER TABLE sale_transactions ALTER COLUMN receipt_no SET NOT NULL;
ALTER TABLE refunds ALTER COLUMN receipt_no SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_transactions_receipt_no ON sale_transactions (shop_id, receipt_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_receipt_no ON refunds (shop_id, receipt_no);
