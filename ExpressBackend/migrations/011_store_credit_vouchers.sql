-- Reworks store credit from a customer-account model to a gift-voucher model: redeeming
-- credit no longer needs a `contacts` record at all. A store-credit refund's own number
-- (REF-XXXXXX, already unique, already printed on the refund slip) IS the redemption code —
-- any cashier can redeem it, in full or in part, on any future sale, without identifying who
-- the customer is. This matches a real POS's "refund voucher" behavior and removes the
-- friction of opening a customer record just to make a walk-in's refund reusable.
--
-- Optionally tagging a known customer to a store-credit refund (for the owner's own
-- tracking) stays available, but is never required for redemption — see refunds.contact_id
-- below.
--
-- Replaces 010_store_credit.sql's store_credit_transactions/store_credit_balances entirely.
-- Verified before writing this migration: both only ever held this session's own test data
-- (9 rows total), so dropping them is not a real-data migration concern.
-- Safe to re-run: guarded with IF NOT EXISTS / CREATE OR REPLACE / IF EXISTS throughout.

-- Optional tagging only — shows up on the Store Credit page if set, nothing else depends on it.
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES contacts(id);

-- One row per redemption EVENT (not per voucher) — a voucher can be partially spent across
-- multiple future visits, same append-only-ledger-with-derived-balance philosophy as every
-- other balance in this schema. No separate "issue" table needed: the refunds row itself
-- (refund_method = 'store_credit') already records the voucher's existence and initial value.
CREATE TABLE IF NOT EXISTS store_credit_redemptions (
  id             SERIAL PRIMARY KEY,
  refund_id      INTEGER NOT NULL REFERENCES refunds(id),  -- which voucher this draws from
  amount         NUMERIC NOT NULL CHECK (amount > 0),
  transaction_id INTEGER REFERENCES sale_transactions(id), -- which checkout it was applied to
  redeemed_by    INTEGER REFERENCES users(id),
  redeemed_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_credit_redemptions_refund ON store_credit_redemptions(refund_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_redemptions_transaction ON store_credit_redemptions(transaction_id);

CREATE OR REPLACE VIEW store_credit_voucher_balances AS
SELECT r.id AS refund_id, r.refund_amount AS initial_amount, r.contact_id, r.refunded_at,
       r.refund_amount - COALESCE(SUM(red.amount), 0) AS balance
FROM refunds r
LEFT JOIN store_credit_redemptions red ON red.refund_id = r.id
WHERE r.refund_method = 'store_credit'
GROUP BY r.id;

DROP VIEW IF EXISTS store_credit_balances;
DROP TABLE IF EXISTS store_credit_transactions;
