import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { HiOutlineShoppingBag, HiOutlineCube, HiOutlineBanknotes, HiOutlineCreditCard } from "react-icons/hi2";
import { useToast } from "components/Toast/ToastContext";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import {
  removeCart,
  increaseQuantity,
  decreaseQuantity,
  setQuantity,
  clearCart,
} from "cartRedux/cartSlice";
import { apiGet, apiPost } from "utils/api";
import { enqueueOfflineSale } from "offline/syncManager";
import { decrementLocalStock } from "offline/cache";
import ReceiptPreviewModal from "./ReceiptPreviewModal";
import ContactSelect from "creditDebitComponents/ContactSelect";

// Cash amounts customers commonly hand over — used to build one-tap tender suggestions.
const CASH_DENOMINATIONS = [50, 100, 500, 1000, 5000];

const roundUpToDenomination = (amount, denomination) =>
  Math.ceil(amount / denomination) * denomination;

const tenderSuggestions = (subtotal) => {
  if (subtotal <= 0) return [];
  const candidates = [subtotal, ...CASH_DENOMINATIONS.map((d) => roundUpToDenomination(subtotal, d))];
  return [...new Set(candidates)].sort((a, b) => a - b).slice(0, 5);
};

// Lets the quantity be typed directly instead of only stepped via +/-. Keeps its own
// draft text while focused (so clearing/retyping digits works) and commits — clamped
// to [1, max stock] by the setQuantity reducer — on blur or Enter.
function QuantityInput({ item, onCommit }) {
  const [value, setValue] = useState(String(item.sellingQuantity));

  useEffect(() => {
    setValue(String(item.sellingQuantity));
  }, [item.sellingQuantity]);

  const commit = () => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      setValue(String(item.sellingQuantity));
    } else {
      onCommit(parsed);
    }
  };

  return (
    <input
      type="number"
      min={1}
      max={item.quantity}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="h-7 w-14 rounded-md border border-surface-border bg-white-A700 text-center text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
    />
  );
}

// The actual cart contents + checkout action. Rendered as an always-visible panel on
// desktop (POS terminal layout) and inside a bottom sheet on mobile — no modal/overlay
// chrome of its own, so it can be dropped into either container.
export default function CartPanel({ onCheckedOut }) {
  const cart = useSelector((state) => state.cart.carts);
  const dispatch = useDispatch();
  const toast = useToast();
  const { t } = useLanguage();

  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  // Set together right after a successful sale to open ReceiptPreviewModal — null means
  // closed. Holding the sold items here (rather than re-reading `cart`, which gets
  // cleared) is what lets the preview keep showing them after checkout.
  const [receiptItems, setReceiptItems] = useState(null);
  const [receiptTotal, setReceiptTotal] = useState(0);
  // The whole-cart receipt number from POST /api/sales/checkout — null for an offline-queued
  // sale (a real number is only assigned once it actually syncs; see syncManager.js).
  const [receiptNo, setReceiptNo] = useState(null);
  // Collapsed by default — the vast majority of sales are walk-in with no customer attached
  // at all, so this whole block (and everything it touches downstream) stays completely out
  // of the way unless a cashier explicitly opens it.
  const [showStoreCredit, setShowStoreCredit] = useState(false);
  const [storeCreditContactId, setStoreCreditContactId] = useState("");
  const [storeCreditBalance, setStoreCreditBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [storeCreditAmount, setStoreCreditAmount] = useState("");

  const calculateSubtotal = () =>
    cart.reduce((total, item) => total + item.sellingPrice * item.sellingQuantity, 0);

  const subtotal = calculateSubtotal();

  useEffect(() => {
    if (!storeCreditContactId) {
      setStoreCreditBalance(null);
      return;
    }
    setLoadingBalance(true);
    apiGet(`/api/store-credit/${storeCreditContactId}/balance`)
      .then((res) => setStoreCreditBalance(res.balance))
      .catch(() => setStoreCreditBalance(null))
      .finally(() => setLoadingBalance(false));
  }, [storeCreditContactId]);

  // Redemption is a mixed/split payment, not all-or-nothing — capped at both what's actually
  // available and the cart's own total (can't redeem more credit than the bill, and never
  // more than the cashier typed in). The real, authoritative check still happens server-side
  // in redeemCredit (Sevices/storeCreditService.js) inside the same DB transaction — this is
  // purely a UX cap so the amount-due math on screen is never misleading.
  const creditToApply = Math.max(
    0,
    Math.min(Number(storeCreditAmount) || 0, storeCreditBalance || 0, subtotal)
  );
  const amountDue = subtotal - creditToApply;

  const tenderedNum = parseFloat(amountTendered) || 0;
  const changeDue = tenderedNum - amountDue;
  const canConfirm = amountDue <= 0 || paymentMethod === "card" || tenderedNum >= amountDue;

  const openPayment = () => {
    setPaymentMethod("cash");
    setAmountTendered("");
    setShowStoreCredit(false);
    setStoreCreditContactId("");
    setStoreCreditAmount("");
    setShowPayment(true);
  };

  const handleCheckout = async () => {
    setIsProcessing(true);

    const salesData = cart.map((item) => ({
      sellingPrice: item.sellingPrice,
      quantity: item.sellingQuantity,
      productID: item.productId || item.id,
      lotId: item.lotId,
    }));

    let wentOffline = false;
    let checkoutReceiptNo = null;

    try {
      // One request for the whole cart, not one per item — see ExpressBackend's
      // checkoutSale for why: it's what makes the receipt a single atomic transaction
      // (all items sell together or none do) with one real receipt number, instead of N
      // independent inserts the server had no way to tie back together.
      // contactId/storeCreditRedeemed are both omitted entirely (undefined, not just falsy)
      // unless the cashier actually opened "Customer has store credit?" and applied some —
      // checkoutSale on the backend treats their absence as a completely ordinary walk-in
      // sale, same as before store credit existed.
      const checkoutPayload = {
        items: salesData,
        paymentMethod,
        contactId: creditToApply > 0 ? Number(storeCreditContactId) : undefined,
        storeCreditRedeemed: creditToApply > 0 ? creditToApply : undefined,
      };

      try {
        const json = await apiPost("/api/sales/checkout", checkoutPayload);
        checkoutReceiptNo = json.data?.receiptNo ?? null;

        // The checkout response flags, per item, when it just dropped below the low-stock
        // threshold — surface that immediately instead of making the cashier notice on
        // the Inventory page later.
        (json.data?.items || [])
          .filter((sold) => sold.lowStock)
          .forEach((sold) => {
            const cartItem = cart.find((c) => (c.productId || c.id) === sold.productID);
            toast.warning(`Low stock: ${cartItem?.productname || "Item"}.`);
          });
      } catch (error) {
        // A real rejection from the server (e.g. "insufficient stock", or the store credit
        // balance no longer covers what was requested) must surface to the cashier as-is,
        // not be queued for a retry that would just fail again. Only an actual dropped
        // connection falls back to the offline outbox — a redemption queued that way is
        // re-validated for real once it actually reaches the server (see storeCreditService's
        // redeemCredit), same accepted behavior stock-insufficiency already has offline.
        if (!error.isNetworkError) throw error;
        wentOffline = true;
        await enqueueOfflineSale(checkoutPayload);
        for (const sale of salesData) {
          await decrementLocalStock(sale.productID, sale.quantity, sale.lotId);
        }
      }

      dispatch(clearCart());
      setShowPayment(false);
      toast.success(
        wentOffline
          ? `Saved offline — will sync automatically once connection is back. Total: PKR ${subtotal}.`
          : paymentMethod === "cash" && changeDue > 0
          ? `Sold for PKR ${subtotal}. Change due: PKR ${changeDue.toFixed(0)}.`
          : creditToApply > 0
          ? `Sold for PKR ${subtotal} — PKR ${creditToApply.toFixed(0)} paid via store credit.`
          : `Sold for PKR ${subtotal}. Products sold successfully!`
      );

      // The sale is already saved at this point (online or offline-queued) — the receipt
      // preview modal below is just an in-app "want a printed copy?" prompt, not a gate
      // on the checkout itself. Works offline too: printReceipt only needs these items +
      // cached company settings, no server round-trip. receiptNo stays null for an
      // offline-queued sale — it's only assigned once the checkout actually reaches the
      // server (see syncManager.js's flush()).
      setReceiptItems(
        cart.map((item) => ({
          productname: item.productname,
          selling_price: item.sellingPrice,
          quantity: item.sellingQuantity,
        }))
      );
      setReceiptTotal(subtotal);
      setReceiptNo(checkoutReceiptNo);

      // NOT called here — onCheckedOut collapses the mobile bottom sheet / floating cart
      // panel this component is rendered inside of (CartDock.jsx / cartCheckout.jsx), and
      // since ReceiptPreviewModal isn't a portal, it lives in that same render tree: firing
      // this immediately unmounted the receipt modal in the same instant it was supposed
      // to appear, so it never showed at all. Deferred to the modal's own onClose instead
      // (below), so the cart UI only collapses once the cashier is actually done with the
      // receipt, not the moment the sale itself finishes.
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemove = (id) => dispatch(removeCart(id));
  const handleDecrease = (id) => dispatch(decreaseQuantity({ id }));
  const handleIncrease = (item) => dispatch(increaseQuantity(item));

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <HiOutlineShoppingBag className="text-5xl text-gray-400" />
            <p className="text-gray-500 dark:text-gray-400">{t("cart.empty")}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">{t("cart.emptyHint")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-border dark:divide-gray-700">
            {cart.map((item) => (
              <li key={item.id} className="flex gap-3 py-4 first:pt-0">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-muted dark:bg-gray-700">
                  <HiOutlineCube className="text-2xl text-gray-400" />
                </div>
                <div className="flex flex-1 flex-col min-w-0">
                  <div className="flex justify-between gap-2 text-sm font-medium text-gray-800 dark:text-gray-100">
                    <span className="truncate">{item.productname}</span>
                    <span className="shrink-0">PKR {item.sellingPrice}</span>
                  </div>
                  {item.lotCode && (
                    <span className="mt-0.5 inline-flex w-fit rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                      {item.lotCode}
                    </span>
                  )}
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleDecrease(item.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-gray-800 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                      >
                        -
                      </button>
                      <QuantityInput
                        item={item}
                        onCommit={(qty) => dispatch(setQuantity({ id: item.id, quantity: qty }))}
                      />
                      <button
                        onClick={() => handleIncrease(item)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-gray-800 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      className="font-medium text-danger-600 hover:text-danger-700"
                    >
                      {t("cart.remove")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-surface-border px-4 py-4 dark:border-gray-700">
        <div className="flex justify-between text-base font-semibold text-gray-800 dark:text-gray-100">
          <span>{t("cart.subtotal")}</span>
          <span>PKR {subtotal}</span>
        </div>
        <button
          onClick={openPayment}
          disabled={cart.length === 0}
          className="mt-3 flex w-full items-center justify-center rounded-lg bg-primary-600 py-3 font-medium text-white-A700 shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("cart.checkout")}
        </button>
      </div>

      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title={t("payment.title")}>
        <div className="mb-4 rounded-lg bg-surface-subtle px-4 py-3 dark:bg-gray-900/40">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">{t("payment.amountDue")}</span>
            <span className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
              PKR {amountDue.toFixed(0)}
            </span>
          </div>
          {creditToApply > 0 && (
            <div className="mt-1 flex items-center justify-between text-xs text-primary-600 dark:text-primary-400">
              <span>{t("payment.storeCreditApplied")}</span>
              <span>- PKR {creditToApply.toFixed(0)}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowStoreCredit((v) => !v)}
          className="mb-4 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
        >
          {showStoreCredit ? t("payment.hideStoreCredit") : t("payment.customerHasStoreCredit")}
        </button>

        {showStoreCredit && (
          <div className="mb-4 rounded-lg border border-dashed border-surface-border p-3 dark:border-gray-700">
            <ContactSelect
              type="customer"
              value={storeCreditContactId}
              onChange={setStoreCreditContactId}
              id="checkout-store-credit-contact"
            />
            {storeCreditContactId && (
              <div className="mt-2">
                {loadingBalance ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t("payment.loadingBalance")}</p>
                ) : (
                  <>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      {t("payment.availableCredit")}: PKR {Number(storeCreditBalance || 0).toFixed(0)}
                    </p>
                    <label className="mb-1 mt-2 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {t("payment.amountToRedeem")}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={Math.min(storeCreditBalance || 0, subtotal)}
                      value={storeCreditAmount}
                      onChange={(e) => setStoreCreditAmount(e.target.value)}
                      placeholder="0"
                      className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod("cash")}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
              paymentMethod === "cash"
                ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400"
                : "border-surface-border text-gray-600 hover:bg-surface-subtle dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            <HiOutlineBanknotes className="text-lg" />
            {t("payment.cash")}
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod("card")}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
              paymentMethod === "card"
                ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400"
                : "border-surface-border text-gray-600 hover:bg-surface-subtle dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            <HiOutlineCreditCard className="text-lg" />
            {t("payment.card")}
          </button>
        </div>

        {amountDue <= 0 && (
          <div className="mb-4 rounded-lg bg-success-50 px-4 py-3 text-sm font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-500">
            {t("payment.fullyCoveredByCredit")}
          </div>
        )}

        {paymentMethod === "cash" && amountDue > 0 && (
          <>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("payment.amountReceived")}
            </label>
            <input
              type="number"
              value={amountTendered}
              onChange={(e) => setAmountTendered(e.target.value)}
              placeholder={t("payment.amountReceivedPlaceholder")}
              autoFocus
              className="mb-2 block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />

            <div className="mb-3 flex flex-wrap gap-2">
              {tenderSuggestions(amountDue).map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setAmountTendered(String(amount))}
                  className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  PKR {amount}
                </button>
              ))}
            </div>

            <div
              className={`mb-4 flex items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold ${
                amountTendered === ""
                  ? "bg-surface-muted text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                  : changeDue >= 0
                  ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500"
                  : "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400"
              }`}
            >
              <span>{changeDue >= 0 ? t("payment.changeDue") : t("payment.amountShort")}</span>
              <span>PKR {Math.abs(amountTendered === "" ? 0 : changeDue).toFixed(0)}</span>
            </div>
          </>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={() => setShowPayment(false)}
            className="rounded-lg bg-surface-muted px-4 py-2 text-gray-800 transition-colors hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            {t("payment.cancel")}
          </button>
          <button
            onClick={handleCheckout}
            disabled={!canConfirm || isProcessing}
            className="rounded-lg bg-primary-600 px-4 py-2 text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? t("payment.processing") : t("payment.confirmSale")}
          </button>
        </div>
      </Modal>

      <ReceiptPreviewModal
        isOpen={receiptItems !== null}
        onClose={() => {
          setReceiptItems(null);
          setReceiptNo(null);
          onCheckedOut?.();
        }}
        items={receiptItems || []}
        totalAmount={receiptTotal}
        receiptNo={receiptNo}
      />
    </div>
  );
}
