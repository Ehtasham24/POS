-- Per-cashier shift / cash-drawer reconciliation ("Z-report"): a cashier opens a shift with
-- a declared opening float, sells normally, and closes by counting the drawer. The system
-- independently computes what should be there and records the variance. See plan.md's
-- "Shift cash-drawer reconciliation + Inventory stock adjustments" section for the full
-- design/reasoning.
-- Safe to re-run: guarded with IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS shifts (
  id             SERIAL PRIMARY KEY,
  opened_by      INTEGER NOT NULL REFERENCES users(id),
  opened_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  opening_float  NUMERIC NOT NULL DEFAULT 0,
  closed_by      INTEGER REFERENCES users(id),
  closed_at      TIMESTAMP,
  -- expected_cash/variance are snapshotted at close time, never recomputed later — a shift
  -- close is a point-in-time reconciliation record (like a receipt), closer in spirit to
  -- sales.buying_price being snapshotted at sale time than to a live-derived balance (e.g.
  -- party_balances). A refund processed after the shift closes, against a sale that
  -- happened during it, shouldn't silently change a reconciliation already signed off on.
  expected_cash  NUMERIC,
  counted_cash   NUMERIC,
  variance       NUMERIC,   -- counted_cash - expected_cash
  status         TEXT NOT NULL DEFAULT 'open',
  notes          TEXT,
  CONSTRAINT shifts_status_check CHECK (status IN ('open', 'closed'))
);

-- One open shift per user at a time — a partial unique index, not app-level-only
-- enforcement, so a double-open race is impossible even under concurrency (same
-- "let Postgres itself guarantee it" approach as lot_code's global uniqueness).
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_one_open_per_user
  ON shifts(opened_by) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);

-- How a cash sale/refund gets attributed to the shift that was open when it happened —
-- stamped explicitly at insert time (checkoutSale/refundSale in Sevices/salesService.js),
-- not inferred later from a time window, so two staff with simultaneously-open shifts never
-- get cross-attributed. Nullable/additive: a sale or refund made with no shift open simply
-- isn't attributed to one, zero behavior change for existing rows or for anyone not using
-- this feature yet.
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(id);
ALTER TABLE refunds           ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(id);
CREATE INDEX IF NOT EXISTS idx_sale_transactions_shift_id ON sale_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_refunds_shift_id ON refunds(shift_id);

-- Cash added to or removed from the drawer mid-shift that isn't a sale/refund — owner
-- topping up the float, or taking cash out to pay a supplier (contact_id optional, for
-- when it genuinely is a supplier payment worth cross-referencing against Credit/Debit).
CREATE TABLE IF NOT EXISTS shift_cash_movements (
  id           SERIAL PRIMARY KEY,
  shift_id     INTEGER NOT NULL REFERENCES shifts(id),
  amount       NUMERIC NOT NULL,  -- signed: + added to drawer, - removed
  reason       TEXT NOT NULL,
  contact_id   INTEGER REFERENCES contacts(id),
  recorded_by  INTEGER NOT NULL REFERENCES users(id),
  recorded_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT shift_cash_movements_amount_check CHECK (amount <> 0)
);
CREATE INDEX IF NOT EXISTS idx_shift_cash_movements_shift_id ON shift_cash_movements(shift_id);
