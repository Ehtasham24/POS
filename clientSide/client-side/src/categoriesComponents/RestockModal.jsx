import { useMemo } from "react";
import { useFeature } from "auth/useFeature";
import AdjustStockModal from "./AdjustStockModal";
import UpdateProductModal from "./updateProductModal";

// "More stock arrived" for one product, opened straight from a low-stock alert. It reuses
// the two flows that already record where stock came from rather than adding a third:
//   - a plain product on a plan with Stock Adjustments → an adjustment under the
//     'restock' reason (attributed, shows up in the Stock Adjustments history);
//   - a batch-tracked product, or a Basic-plan shop (no Stock Adjustments, quantity is
//     edited directly there) → the Update modal, whose lot section adds to a lot or
//     receives a new one with its vendor and buying price.
// `product` is a row from /api/inventory (id, productname, category_id, batch_tracked,
// buyingprice, quantity).
export default function RestockModal({ product, onClose, onRestocked }) {
  const hasStockAdjustments = useFeature("stockAdjustments");
  // UpdateProductModal re-selects whenever initialProduct changes identity, so it must be
  // stable across this component's re-renders.
  const initialProduct = useMemo(
    () =>
      product && {
        product_id: product.id,
        productname: product.productname,
        category_id: product.category_id,
        batch_tracked: product.batch_tracked,
        buyingprice: product.buyingprice,
        quantity: product.quantity,
      },
    [product]
  );

  if (!product) return null;

  if (!product.batch_tracked && hasStockAdjustments) {
    return (
      <AdjustStockModal
        isOpen
        onClose={onClose}
        product={product}
        defaultReason="restock"
        onAdjusted={() => {
          onRestocked();
          onClose();
        }}
      />
    );
  }

  return <UpdateProductModal isOpen onClose={onClose} initialProduct={initialProduct} onChanged={onRestocked} />;
}
