-- Receipt/slip numbers: checkout previously had no server-side concept of "these N sale
-- rows are one transaction" — Sales History only ever inferred that by grouping rows that
-- landed within the same DATE_TRUNC('second', sale_time), a fine heuristic for a history
-- display but not something a receipt number (and, later, refunds) should have to trust.
--
-- sale_transactions is the real anchor: one row per checkout. Its id IS the receipt
-- number's source of truth — Postgres allocates SERIAL values atomically under concurrency
-- by design, the same guarantee sales.id/users.id already rely on — so there is no custom
-- counter/locking logic here, and therefore no duplicate-number bug class possible. The
-- app formats it for display (e.g. "RCPT-000128") at render time, not stored here.
--
-- sales.transaction_id is nullable: existing historical sales predate this migration and
-- have no transaction to point to — fetchBilledHistory keeps grouping those via the old
-- timestamp heuristic as a fallback (see Sevices/salesService.js), same "don't break
-- history" treatment already given to sold_by/voided_by on older rows.
--
-- Safe to re-run: guarded with IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS sale_transactions (
  id             SERIAL PRIMARY KEY,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  sold_by        INTEGER REFERENCES users(id),
  payment_method TEXT
);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_id INTEGER REFERENCES sale_transactions(id);
