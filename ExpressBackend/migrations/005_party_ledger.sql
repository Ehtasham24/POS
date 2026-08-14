-- Party ledger: replaces credit/debit's mutable running-total rows with an append-only
-- transaction log per (contact, direction). credit/debit today hold only amount_due /
-- amount_received / amount_pending with no timestamps and no history — settling a balance
-- overwrites those numbers in place, so there is no way to answer "what did this person pay
-- and when." This also fixes the same person ending up scattered across multiple rows
-- (confirmed live: Waseem has two credit rows, Maaz has two debit rows) since a party's
-- balance is now derived by summing their transactions, not stored per-row.
-- Safe to re-run: guarded with IF NOT EXISTS / ON CONFLICT / NOT EXISTS checks throughout.

CREATE TABLE IF NOT EXISTS party_transactions (
  id          SERIAL PRIMARY KEY,
  contact_id  INTEGER NOT NULL REFERENCES contacts(id),
  direction   TEXT NOT NULL,   -- 'receivable' = customer owes us | 'payable' = we owe supplier
  kind        TEXT NOT NULL,   -- 'charge' | 'payment' | 'adjustment'
  amount      NUMERIC NOT NULL,
  occurred_on TIMESTAMP NOT NULL DEFAULT NOW(),  -- business date (backdatable by the user)
  note        TEXT,
  sale_id     INTEGER REFERENCES sales(id),  -- reserved: a credit sale -> receivable (future)
  lot_id      INTEGER REFERENCES lots(id),   -- reserved: a stock purchase -> payable (future)
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),  -- when the row was actually entered
  CONSTRAINT party_transactions_direction_check
    CHECK (direction IN ('receivable', 'payable')),
  CONSTRAINT party_transactions_kind_check
    CHECK (kind IN ('charge', 'payment', 'adjustment')),
  CONSTRAINT party_transactions_amount_check
    CHECK ((kind IN ('charge','payment') AND amount > 0) OR (kind = 'adjustment' AND amount <> 0))
);

CREATE INDEX IF NOT EXISTS idx_party_transactions_contact_direction
  ON party_transactions(contact_id, direction);
CREATE INDEX IF NOT EXISTS idx_party_transactions_occurred_on ON party_transactions(occurred_on);
CREATE INDEX IF NOT EXISTS idx_party_transactions_sale_id ON party_transactions(sale_id);

-- Balances are derived, never stored, so they cannot drift out of sync with the
-- transactions that produced them (the exact failure mode of the old amount_pending column).
CREATE OR REPLACE VIEW party_balances AS
SELECT contact_id, direction,
       SUM(CASE WHEN kind = 'payment' THEN -amount ELSE amount END) AS balance,
       SUM(CASE WHEN kind = 'charge'  THEN amount ELSE 0 END)       AS total_charged,
       SUM(CASE WHEN kind = 'payment' THEN amount ELSE 0 END)       AS total_paid,
       MAX(occurred_on) AS last_activity_on,
       COUNT(*)         AS transaction_count
FROM party_transactions
GROUP BY contact_id, direction;

-- One-time data migration: every existing credit/debit row becomes an opening-balance
-- charge (+ a payment row too, if anything had already been received). No original
-- timestamps exist on credit/debit to recover, so both are dated NOW(). Guarded by NOT
-- EXISTS on the note so re-running this file can't double-insert.
INSERT INTO party_transactions (contact_id, direction, kind, amount, occurred_on, note)
SELECT contact_id, 'receivable', 'charge', amount_due, NOW(),
       'Opening balance (migrated from credit id ' || id || ')'
FROM credit
WHERE contact_id IS NOT NULL
  AND amount_due > 0
  AND NOT EXISTS (
    SELECT 1 FROM party_transactions
    WHERE note = 'Opening balance (migrated from credit id ' || credit.id || ')'
  );

INSERT INTO party_transactions (contact_id, direction, kind, amount, occurred_on, note)
SELECT contact_id, 'receivable', 'payment', amount_received, NOW(),
       'Opening balance payment (migrated from credit id ' || id || ')'
FROM credit
WHERE contact_id IS NOT NULL
  AND amount_received > 0
  AND NOT EXISTS (
    SELECT 1 FROM party_transactions
    WHERE note = 'Opening balance payment (migrated from credit id ' || credit.id || ')'
  );

INSERT INTO party_transactions (contact_id, direction, kind, amount, occurred_on, note)
SELECT contact_id, 'payable', 'charge', amount_due, NOW(),
       'Opening balance (migrated from debit id ' || id || ')'
FROM debit
WHERE contact_id IS NOT NULL
  AND amount_due > 0
  AND NOT EXISTS (
    SELECT 1 FROM party_transactions
    WHERE note = 'Opening balance (migrated from debit id ' || debit.id || ')'
  );

INSERT INTO party_transactions (contact_id, direction, kind, amount, occurred_on, note)
SELECT contact_id, 'payable', 'payment', amount_received, NOW(),
       'Opening balance payment (migrated from debit id ' || id || ')'
FROM debit
WHERE contact_id IS NOT NULL
  AND amount_received > 0
  AND NOT EXISTS (
    SELECT 1 FROM party_transactions
    WHERE note = 'Opening balance payment (migrated from debit id ' || debit.id || ')'
  );

-- credit/debit are deliberately left in place (not dropped) so there's a rollback path
-- until the new ledger has been used for a while. Nothing in the app reads them anymore
-- once the backend service switch lands in the same deploy as this migration.
