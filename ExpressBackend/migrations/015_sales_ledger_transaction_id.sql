-- Surfaces the payment medium (cash/card/bank_transfer) already recorded on every
-- checkout — sales.transaction_id -> sale_transactions.payment_method already exists,
-- this view just didn't carry transaction_id through to let reporting join onto it.
--
-- Both branches already have a `sales` row in scope (the sale branch selects from it
-- directly; the refund branch already JOINs the original `sales s` for buying_price), so
-- transaction_id is free in both cases. A refund on a card sale keeps counting under Card
-- as a negative amount, consistent with how this view already folds refunds in as
-- negative-quantity rows dated on their own event_time (see 009_refunds.sql).
CREATE OR REPLACE VIEW sales_ledger AS
SELECT
  s.id AS sale_id,
  s.product_id,
  s.sale_time AS event_time,
  s.quantity,
  s.selling_price,
  s.buying_price,
  s.transaction_id
FROM sales s
WHERE s.is_voided = false

UNION ALL

SELECT
  r.sale_id,
  s.product_id,
  r.refunded_at AS event_time,
  -r.quantity AS quantity,
  (r.refund_amount / r.quantity) AS selling_price,
  s.buying_price,
  s.transaction_id
FROM refunds r
JOIN sales s ON r.sale_id = s.id
WHERE s.is_voided = false;
