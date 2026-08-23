import { useEffect, useState } from "react";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { apiGet, apiPost } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

const REASON_CODES = ["damaged", "expired", "theft", "count_correction", "other"];
const reasonLabelKey = {
  damaged: "inventory.adjustStockReasonDamaged",
  expired: "inventory.adjustStockReasonExpired",
  theft: "inventory.adjustStockReasonTheft",
  count_correction: "inventory.adjustStockReasonCountCorrection",
  other: "inventory.adjustStockReasonOther",
};

// Records a stock adjustment (Sevices/stockAdjustmentService.js) — shrinkage (theft/damage/
// expiry) or a physical-count correction, reason-coded and attributed, the audited
// replacement for silently retyping a product's quantity. Owner-only (matches the rest of
// Inventory). `product` is the row from Inventory's own list (id, productname, batch_tracked,
// quantity) — for a batch-tracked product a specific lot must be picked, mirroring
// updateProductModal.jsx's own lot-dropdown data source.
export default function AdjustStockModal({ isOpen, onClose, product, onAdjusted }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [lots, setLots] = useState([]);
  const [lotId, setLotId] = useState("");
  const [quantityChange, setQuantityChange] = useState("");
  const [reasonCode, setReasonCode] = useState("damaged");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !product?.batch_tracked) {
      setLots([]);
      setLotId("");
      return;
    }
    apiGet(`/api/products/${product.id}/lots`)
      .then((data) => {
        setLots(data);
        setLotId(data[0]?.id ? String(data[0].id) : "");
      })
      .catch((error) => toast.error(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, product?.id, product?.batch_tracked]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (product.batch_tracked && !lotId) {
      toast.error(t("inventory.adjustStockLot"));
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/stock-adjustments", {
        productId: product.id,
        lotId: product.batch_tracked ? lotId : undefined,
        quantityChange: Number(quantityChange),
        reasonCode,
        note: note || undefined,
      });
      toast.success(t("inventory.adjustStockSuccess"));
      setQuantityChange("");
      setNote("");
      onAdjusted();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!product) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("inventory.adjustStockTitle")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">{product.productname}</p>

        {product.batch_tracked && (
          <div>
            <label htmlFor="adjust_lot" className={labelClass}>
              {t("inventory.adjustStockLot")}
            </label>
            <select
              id="adjust_lot"
              value={lotId}
              onChange={(e) => setLotId(e.target.value)}
              className={inputClass}
              required
            >
              {lots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.lot_code} ({t("inventory.remaining")}: {lot.qty_remaining})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="adjust_quantity" className={labelClass}>
            {t("inventory.adjustStockQuantityChange")}
          </label>
          <input
            type="number"
            id="adjust_quantity"
            step="1"
            value={quantityChange}
            onChange={(e) => setQuantityChange(e.target.value)}
            placeholder="-1"
            className={inputClass}
            required
            autoFocus
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("inventory.adjustStockQuantityHint")}</p>
        </div>

        <div>
          <label htmlFor="adjust_reason" className={labelClass}>
            {t("inventory.adjustStockReason")}
          </label>
          <select
            id="adjust_reason"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className={inputClass}
            required
          >
            {REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {t(reasonLabelKey[code])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="adjust_note" className={labelClass}>
            {t("inventory.adjustStockNote")}
          </label>
          <textarea
            id="adjust_note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-muted px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("inventory.adjustStockSubmit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
