-- Refunds: a sale that genuinely happened, later reversed (in full or part), possibly days
-- later by different staff than the one who rang it up. Deliberately NOT the same mechanism
-- as void (007_sales_void.sql) — void means "this never really happened" (same-day, own-sale,
-- erased from revenue entirely); a refund's original sale stays exactly as recorded, since it
-- really was revenue on its day. One row per refund EVENT (not per sale), so multiple partial
-- refunds against the same sale over time each keep their own reason/method/date/who — "how
-- much of this sale has been refunded so far" is derived via SUM(quantity) WHERE sale_id = ...,
-- never cached on the sales row itself (same never-trust-a-flag-when-you-can-derive-it
-- approach already used throughout this schema).
-- Safe to re-run: guarded with IF NOT EXISTS / CREATE OR REPLACE throughout.

CREATE TABLE IF NOT EXISTS refunds (
  id             SERIAL PRIMARY KEY,
  sale_id        INTEGER NOT NULL REFERENCES sales(id),
  -- Denormalized copy of sales.transaction_id — lets a refund be looked up by receipt number
  -- without joining back through sales every time. NULL for legacy pre-receipt-number sales.
  transaction_id INTEGER REFERENCES sale_transactions(id),
  quantity       INTEGER NOT NULL,
  -- Actual money returned for THIS event — may be less than quantity * the sale's
  -- selling_price for a goodwill/partial-amount refund, but never more than that.
  refund_amount  NUMERIC NOT NULL,
  refund_method  TEXT NOT NULL,
  -- Whether the returned unit(s) went back into sellable stock or were written off.
  condition      TEXT NOT NULL DEFAULT 'resellable',
  -- Mandatory (unlike void's optional void_reason) — a refund is a money-out, customer-facing
  -- event that warrants a clearer audit trail than an internal same-day correction does.
  reason         TEXT NOT NULL,
  refunded_by    INTEGER REFERENCES users(id),
  refunded_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT refunds_quantity_positive CHECK (quantity > 0),
  CONSTRAINT refunds_method_check CHECK (refund_method IN ('cash', 'card', 'store_credit')),
  CONSTRAINT refunds_condition_check CHECK (condition IN ('resellable', 'damaged'))
);
CREATE INDEX IF NOT EXISTS idx_refunds_sale_id ON refunds(sale_id);
CREATE INDEX IF NOT EXISTS idx_refunds_transaction_id ON refunds(transaction_id);

-- Unified revenue/profit ledger: the original sale (positive) plus every refund against it
-- (negative), each dated on its OWN event_time. This is what lets Sales Report reduce revenue
-- on the day a refund actually happens instead of retroactively rewriting the day of the
-- original sale (which is what filtering refunded sales out of `sales` entirely would do —
-- correct for void, wrong for refund, since the original sale really was revenue when it
-- happened).
--
-- selling_price on a refund row is refund_amount / quantity (the actual per-unit amount paid
-- back), not the original sale's selling_price — so quantity * selling_price still equals
-- -refund_amount exactly even for a reduced/goodwill refund. buying_price stays the sale's
-- real per-unit cost, so profit (selling_price - buying_price) still comes out correct per
-- unit reversed, regardless of what amount was actually refunded.
CREATE OR REPLACE VIEW sales_ledger AS
SELECT
  s.id AS sale_id,
  s.product_id,
  s.sale_time AS event_time,
  s.quantity,
  s.selling_price,
  s.buying_price
FROM sales s
WHERE s.is_voided = false

UNION ALL

SELECT
  r.sale_id,
  s.product_id,
  r.refunded_at AS event_time,
  -r.quantity AS quantity,
  (r.refund_amount / r.quantity) AS selling_price,
  s.buying_price
FROM refunds r
JOIN sales s ON r.sale_id = s.id
WHERE s.is_voided = false;
