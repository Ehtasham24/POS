-- Indexes for the Sales Report's date-range reads (Sevices/salesService.js).
--
-- Sales are already covered by idx_sales_shop_sale_time. These cover the other two
-- time-ranged sources, which otherwise scan every refund / sale the shop has ever had on
-- each report load, and grow slower with every month of history:
--   * sales_ledger's refund half filters on refunds.refunded_at (per shop);
--   * the "Voided" tile counts sales by voided_at, and only voided ones — a partial index
--     stays tiny since voids are rare.
CREATE INDEX IF NOT EXISTS idx_refunds_shop_refunded_at ON refunds (shop_id, refunded_at);
CREATE INDEX IF NOT EXISTS idx_sales_shop_voided_at ON sales (shop_id, voided_at) WHERE is_voided;

-- (shop_id, refunded_at) leads with shop_id, so the single-column index is now redundant.
DROP INDEX IF EXISTS idx_refunds_shop_id;
