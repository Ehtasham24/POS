import { useEffect, useMemo, useState } from "react";
import { HiOutlineMinus, HiOutlinePlus, HiOutlineQrCode } from "react-icons/hi2";
import { Modal } from "components";
import Numpad from "components/Numpad";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { apiGet } from "utils/api";
import * as offlineCache from "offline/cache";
import { formatPKR } from "utils/money";
import { getLastPrice } from "utils/posMemory";

// One dialog for every way a product reaches the sale — tile tap, search, lot-code scan.
// Replaces the two copies of "pick a lot" + "Sell Product" modals the old Categories and
// Product List pages each carried. Batch-tracked products choose their lot here too (the
// first lot with stock is preselected); a scanned lot code arrives with its lot already set.
//
// `product` is the register's normalized shape: { productId, productname, category_id,
// batch_tracked, buyingprice, quantity, lot? }. `inCartQty(lineId)` says how many of that
// exact line are already in the sale, so the quantity cap is what's actually left.
export default function SellDialog({ product, categoryName, inCartQty, onClose, onAdd }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [lots, setLots] = useState(null); // null = not needed / still loading
  const [lot, setLot] = useState(product.lot || null);
  const [quantity, setQuantity] = useState("1");
  const lastPrice = getLastPrice(product.productId);
  const [price, setPrice] = useState(lastPrice ? String(lastPrice) : "");

  useEffect(() => {
    if (!product.batch_tracked || product.lot) return;
    let cancelled = false;
    offlineCache
      .withFallback(
        () => apiGet(`/api/products/${product.productId}/lots`),
        () => offlineCache.getProductLots(product.productId)
      )
      .then((all) => {
        if (cancelled) return;
        const available = all.filter((l) => Number(l.qty_remaining) > 0);
        setLots(available);
        setLot(available[0] || null);
      })
      .catch((error) => {
        console.error("Error fetching lots:", error);
        toast.error("Couldn't load lots — check your connection and try again.");
        if (!cancelled) setLots([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const lineId = lot ? `lot-${lot.id}` : product.productId;
  const stock = Number(lot ? lot.qty_remaining : product.quantity) || 0;
  const available = Math.max(0, stock - (inCartQty(lineId) || 0));
  const cost = Number(lot ? lot.buying_price : product.buyingprice) || 0;
  const qtyNum = parseInt(quantity, 10) || 0;
  const priceNum = parseInt(price, 10) || 0;
  const needsLot = product.batch_tracked && !lot;
  const qtyInvalid = qtyNum < 1 || qtyNum > available;
  const canAdd = !needsLot && !qtyInvalid && priceNum > 0;

  const margin = useMemo(() => {
    if (!priceNum || !cost) return null;
    return { amount: priceNum - cost, percent: Math.round(((priceNum - cost) / priceNum) * 100) };
  }, [priceNum, cost]);

  const stepQty = (delta) => setQuantity((q) => String(Math.min(Math.max((parseInt(q, 10) || 0) + delta, 1), Math.max(available, 1))));

  const submit = () => {
    if (!canAdd) return;
    onAdd({
      id: lineId,
      productId: product.productId,
      productname: product.productname,
      category_id: product.category_id,
      quantity: stock,
      lotId: lot?.id,
      lotCode: lot?.lot_code,
      sellingPrice: priceNum,
      sellingQuantity: qtyNum,
      costPrice: cost,
    });
  };

  return (
    <Modal isOpen onClose={onClose} title={product.productname} maxWidth="max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          {categoryName && (
            <span className="rounded-full bg-surface-muted px-2.5 py-1 font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {categoryName}
            </span>
          )}
          <span className="rounded-full bg-surface-muted px-2.5 py-1 font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {t("sell.inStock")}: {available}
          </span>
          <span className="rounded-full bg-surface-muted px-2.5 py-1 font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {t("sell.costPrice")}: {formatPKR(cost)}
          </span>
        </div>

        {product.batch_tracked && !product.lot && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t("register.chooseLot")}
            </p>
            {lots === null ? (
              <div className="h-14 animate-pulse rounded-xl bg-surface-muted dark:bg-gray-700" />
            ) : lots.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t("register.outOfStock")}</p>
            ) : (
              <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                {lots.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLot(l)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                      lot?.id === l.id
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-500/10"
                        : "border-surface-border hover:bg-surface-subtle dark:border-gray-700 dark:hover:bg-gray-700"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-100">
                      <HiOutlineQrCode className="text-primary-600 dark:text-primary-400" />
                      {l.lot_code}
                      <span className="font-normal text-gray-500 dark:text-gray-400">· {l.vendor_name || "—"}</span>
                    </span>
                    <span className="text-right text-xs text-gray-600 dark:text-gray-300">
                      {formatPKR(l.buying_price)} · {t("register.left", { n: l.qty_remaining })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {product.lot && (
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
            <HiOutlineQrCode />
            {product.lot.lot_code}
          </p>
        )}

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-1">
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("sell.quantity")}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => stepQty(-1)}
                  aria-label="Decrease quantity"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-gray-800 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                >
                  <HiOutlineMinus />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={available}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="no-spin h-12 w-full min-w-0 rounded-xl border border-surface-border bg-white-A700 text-center font-poppins text-lg font-semibold text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => stepQty(1)}
                  aria-label="Increase quantity"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-gray-800 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                >
                  <HiOutlinePlus />
                </button>
              </div>
              {qtyInvalid && !needsLot && (
                <p className="mt-1 text-xs font-medium text-danger-600">
                  {available === 0 ? t("register.outOfStock") : t("sell.quantityError", { max: available })}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("sell.sellingPrice")} <span className="normal-case">({t("register.each")})</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-gray-400">
                  PKR
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
                  autoFocus
                  placeholder="0"
                  className="no-spin h-14 w-full rounded-xl border border-surface-border bg-white-A700 pl-12 pr-3 text-right font-poppins text-2xl font-bold text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {lastPrice && String(lastPrice) !== price && (
                  <button
                    type="button"
                    onClick={() => setPrice(String(lastPrice))}
                    className="rounded-full bg-primary-50 px-2.5 py-1 font-semibold text-primary-700 hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-400"
                  >
                    {t("register.lastSold")} {formatPKR(lastPrice)}
                  </button>
                )}
                {margin &&
                  (margin.amount < 0 ? (
                    <span className="rounded-full bg-danger-50 px-2.5 py-1 font-semibold text-danger-600 dark:bg-danger-500/10 dark:text-danger-500">
                      {t("register.belowCost")} ({formatPKR(margin.amount)})
                    </span>
                  ) : (
                    <span className="rounded-full bg-success-50 px-2.5 py-1 font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-500">
                      {t("register.margin")} {formatPKR(margin.amount)} · {margin.percent}%
                    </span>
                  ))}
              </div>
            </div>

            {priceNum > 0 && qtyNum > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-surface-subtle px-4 py-3 dark:bg-gray-900/40">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {qtyNum} × {formatPKR(priceNum)}
                </span>
                <span className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                  {formatPKR(qtyNum * priceNum)}
                </span>
              </div>
            )}
          </div>

          <Numpad value={price} onChange={setPrice} className="content-start" />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-xl bg-surface-muted font-semibold text-gray-800 transition-colors hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            {t("sell.cancel")}
          </button>
          <button
            type="submit"
            disabled={!canAdd}
            className="h-12 flex-[2] rounded-xl bg-primary-600 font-semibold text-white-A700 shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("sell.addToCart")}
            {canAdd && ` · ${formatPKR(qtyNum * priceNum)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
