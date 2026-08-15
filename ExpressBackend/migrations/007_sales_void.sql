-- Sale void: sales were previously permanent once entered (POST-only /sales route, no
-- edit/delete anywhere) — a cashier's typo had to be fixed via direct DB surgery. The
-- original row is never deleted or overwritten in its original fields when voided —
-- same append-only philosophy as party_transactions (005): never destroy history, mark
-- status instead. Who's allowed to void what (own sale same-day for cashiers, anything
-- for owners) is enforced in application code (Sevices/salesService.js's voidSale), not
-- here, since it depends on the requesting user, not just the row.
-- Safe to re-run: guarded with IF NOT EXISTS throughout.

ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_voided   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMP;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_by   INTEGER REFERENCES users(id);
