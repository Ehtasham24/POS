-- Store credit: money the SHOP owes a customer (issued from a refund), redeemable on a
-- future purchase. Deliberately NOT the same ledger as party_transactions (Credit/Debit,
-- 005_party_ledger.sql) — that models debt the customer/vendor owes the SHOP (receivable/
-- payable); store credit is the opposite direction, and needs different reference columns
-- (refund_id, transaction_id) that don't fit party_transactions' sale_id/lot_id (which model
-- credit sales and stock purchases, a different concept). Keeping it separate also means zero
-- risk to the already-shipped Credit/Debit feature.
--
-- Mirrors party_transactions' proven append-only ledger + derived-balance-VIEW pattern
-- exactly: one row per issue/redeem EVENT, balance never stored, always summed fresh from the
-- ledger on read (via store_credit_balances below) so it can never drift out of sync.
-- Safe to re-run: guarded with IF NOT EXISTS / CREATE OR REPLACE throughout.

CREATE TABLE IF NOT EXISTS store_credit_transactions (
  id             SERIAL PRIMARY KEY,
  contact_id     INTEGER NOT NULL REFERENCES contacts(id),
  kind           TEXT NOT NULL,          -- 'issue' | 'redeem' | 'adjustment'
  amount         NUMERIC NOT NULL,       -- always positive; kind determines direction
  refund_id      INTEGER REFERENCES refunds(id),           -- set when kind = 'issue' via a refund
  transaction_id INTEGER REFERENCES sale_transactions(id), -- set when kind = 'redeem' at checkout
  note           TEXT,
  occurred_on    TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT store_credit_kind_check CHECK (kind IN ('issue', 'redeem', 'adjustment')),
  CONSTRAINT store_credit_amount_check
    CHECK ((kind IN ('issue','redeem') AND amount > 0) OR (kind = 'adjustment' AND amount <> 0))
);
CREATE INDEX IF NOT EXISTS idx_store_credit_contact ON store_credit_transactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_refund ON store_credit_transactions(refund_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_transaction ON store_credit_transactions(transaction_id);

CREATE OR REPLACE VIEW store_credit_balances AS
SELECT contact_id,
       SUM(CASE WHEN kind = 'redeem' THEN -amount ELSE amount END) AS balance,
       SUM(CASE WHEN kind = 'issue'  THEN amount ELSE 0 END)       AS total_issued,
       SUM(CASE WHEN kind = 'redeem' THEN amount ELSE 0 END)       AS total_redeemed,
       MAX(occurred_on) AS last_activity_on,
       COUNT(*) AS transaction_count
FROM store_credit_transactions
GROUP BY contact_id;

-- Checkout gains an optional customer link + how much store credit was applied — nullable/
-- zero-default so every existing sale, and every future anonymous walk-in sale (still the
-- vast majority), is completely unaffected.
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES contacts(id);
ALTER TABLE sale_transactions ADD COLUMN IF NOT EXISTS store_credit_applied NUMERIC NOT NULL DEFAULT 0;
