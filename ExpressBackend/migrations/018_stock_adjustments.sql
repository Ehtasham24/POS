-- Inventory stock adjustments: a dedicated, reason-coded way to correct a product/lot's
-- quantity for shrinkage (theft, damage, expiry) or a physical-count correction — permanent,
-- attributed, queryable, distinct from a sale, void, refund, or stock receipt (lots). Closes
-- the gap where the only way to change a product's quantity outside those flows was silently
-- overwriting it via product-edit, with no reason and no trail. See plan.md's "Shift
-- cash-drawer reconciliation + Inventory stock adjustments" section for the full design.
-- Safe to re-run: guarded with IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id               SERIAL PRIMARY KEY,
  product_id       INTEGER NOT NULL REFERENCES products(id),
  lot_id           INTEGER REFERENCES lots(id),  -- set for batch-tracked products
  quantity_change  INTEGER NOT NULL,             -- signed: negative = loss, positive = found/correction-up
  -- Snapshotted at adjustment time (same reasoning as sales.buying_price) so this
  -- adjustment's cost impact stays stable even if the product's price changes later.
  buying_price     NUMERIC NOT NULL,
  reason_code      TEXT NOT NULL,
  note             TEXT,
  adjusted_by      INTEGER NOT NULL REFERENCES users(id),
  adjusted_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_adjustments_quantity_check CHECK (quantity_change <> 0),
  CONSTRAINT stock_adjustments_reason_check
    CHECK (reason_code IN ('damaged', 'expired', 'theft', 'count_correction', 'other'))
);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product_id ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_adjusted_at ON stock_adjustments(adjusted_at);
