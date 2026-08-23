-- Full traceability for a lot: who accepted/recorded the delivery, not just vendor + when.
-- Auto-captured from whoever is logged in and creates the lot (Sevices/lotService.js's
-- createLot) — same attribution pattern already used everywhere else in this app
-- (sales.sold_by, refunds.refunded_by, stock_adjustments.adjusted_by, shifts.opened_by) —
-- not a manually-typed field, so it can't be misattributed or left blank.
ALTER TABLE lots ADD COLUMN IF NOT EXISTS received_by INTEGER REFERENCES users(id);

-- 'restock' covers a plain (non-batch-tracked) product legitimately receiving more stock —
-- now that Update/Edit Product no longer accept a quantity change at all (any change, up or
-- down, must go through Stock Adjustment), a plain product needs its OWN reason for "more
-- arrived" distinct from the loss reasons ('damaged'/'expired'/'theft'/'count_correction').
-- Postgres has no ALTER CONSTRAINT, so the existing CHECK is dropped and re-added with the
-- new value — guarded so re-running this migration is still a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_adjustments_reason_check'
  ) THEN
    ALTER TABLE stock_adjustments DROP CONSTRAINT stock_adjustments_reason_check;
  END IF;
  ALTER TABLE stock_adjustments
    ADD CONSTRAINT stock_adjustments_reason_check
    CHECK (reason_code IN ('damaged', 'expired', 'theft', 'count_correction', 'restock', 'other'));
END $$;
