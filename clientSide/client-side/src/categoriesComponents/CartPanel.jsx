import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  HiOutlineShoppingBag,
  HiOutlineBanknotes,
  HiOutlineCreditCard,
  HiOutlineQrCode,
  HiOutlineTrash,
  HiOutlinePause,
  HiOutlineClock,
  HiOutlineMinus,
  HiOutlinePlus,
  HiOutlineXMark,
  HiChevronDown,
} from "react-icons/hi2";
import { useToast } from "components/Toast/ToastContext";
import { Modal } from "components";
import Numpad from "components/Numpad";
import { useLanguage } from "i18n/LanguageContext";
import { useAuth } from "auth/AuthContext";
import { useTimezone } from "timezone/TimezoneContext";
import {
  removeCart,
  increaseQuantity,
  decreaseQuantity,
  setQuantity,
  setPrice,
  clearCart,
  replaceCart,
} from "cartRedux/cartSlice";
import { apiGet, apiPost } from "utils/api";
import { enqueueOfflineSale } from "offline/syncManager";
import { decrementLocalStock } from "offline/cache";
import useOfflineStatus from "hooks/useOfflineStatus";
import { useFeature } from "auth/useFeature";
import useShiftStatus from "hooks/useShiftStatus";
import { formatPKR } from "utils/money";
import { rememberPrices, loadHeldSales, saveHeldSales, MAX_HELD_SALES } from "utils/posMemory";
import ReceiptPreviewModal from "./ReceiptPreviewModal";
import BankTransferQrModal from "./BankTransferQrModal";
import OpenShiftModal from "./OpenShiftModal";

// Cash amounts customers commonly hand over — used to build one-tap tender suggestions.
const CASH_DENOMINATIONS = [50, 100, 500, 1000, 5000];

const roundUpToDenomination = (amount, denomination) =>
  Math.ceil(amount / denomination) * denomination;

const tenderSuggestions = (subtotal) => {
  if (subtotal <= 0) return [];
  const candidates = [subtotal, ...CASH_DENOMINATIONS.map((d) => roundUpToDenomination(subtotal, d))];
  return [...new Set(candidates)].sort((a, b) => a - b).slice(0, 5);
};

const lineTotal = (item) => item.sellingPrice * item.sellingQuantity;

// A number typed straight into a line (quantity, or unit price). Keeps its own draft while
// focused so clearing/retyping digits works, and commits on blur or Enter — the reducer
// does the clamping/validation.
function InlineNumber({ value, onCommit, className, ariaLabel, min = 1 }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (Number.isNaN(parsed) || parsed < min) setDraft(String(value));
    else onCommit(parsed);
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={`no-spin ${className}`}
    />
  );
}

const stepButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-gray-800 transition-colors hover:bg-surface-border active:scale-95 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600";

const methodTileClass = (active) =>
  `flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-semibold transition-colors ${
    active
      ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400"
      : "border-surface-border text-gray-600 hover:bg-surface-subtle dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
  }`;

// The current sale + checkout. Rendered as the register's order panel (beside the product
// grid, or in a bottom sheet on phones) and inside the floating cart on every other page —
// no modal/overlay chrome of its own, so it drops into either container.
//
// `hotkeys` (the register only): F4 opens payment. `onSold` fires as soon as a sale is saved
// (online or queued offline) so the register can refresh stock. `onClose` adds a collapse
// button to the header, for when this panel lives in a sheet.
export default function CartPanel({ onCheckedOut, onSold, onClose, hotkeys = false }) {
  const cart = useSelector((state) => state.cart.carts);
  const dispatch = useDispatch();
  const toast = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { formatDateTime } = useTimezone();
  const { online } = useOfflineStatus();
  const hasBankTransfer = useFeature("bankTransfer");
  const hasStoreCredit = useFeature("storeCredit");
  // No open shift: warned here and on the payment screen too, not only when checkout fails —
  // non-blocking (the server is the actual gate), with a one-tap way to open one.
  const { needsShift, refresh: refreshShift } = useShiftStatus();
  const [showOpenShift, setShowOpenShift] = useState(false);

  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  // Bank-transfer checkout is its own, separate flow (handleBankTransferCheckout below) —
  // it opens a pending payment intent + QR instead of an immediate sale, so it gets its
  // own in-flight flag and its own follow-up modal rather than reusing isProcessing/
  // ReceiptPreviewModal, which are cash/card's "sale already happened" concepts.
  const [isCreatingBankIntent, setIsCreatingBankIntent] = useState(false);
  const [bankIntent, setBankIntent] = useState(null);
  const [showBankQr, setShowBankQr] = useState(false);
  // Set together right after a successful sale to open ReceiptPreviewModal — null means
  // closed. Holding the sold items here (rather than re-reading `cart`, which gets
  // cleared) is what lets the preview keep showing them after checkout.
  const [receiptItems, setReceiptItems] = useState(null);
  const [receiptTotal, setReceiptTotal] = useState(0);
  // The whole-cart receipt number from POST /api/sales/checkout — null for an offline-queued
  // sale (a real number is only assigned once it actually syncs; see syncManager.js).
  const [receiptNo, setReceiptNo] = useState(null);
  // How much of THIS checkout was covered by store credit — set from creditToApply right
  // after a successful sale, same as receiptNo, so the preview/print actually shows the
  // breakdown instead of a receipt that silently looks like a plain cash/card sale.
  const [receiptCreditApplied, setReceiptCreditApplied] = useState(0);
  // Collapsed by default — the vast majority of sales are walk-in with no voucher involved
  // at all, so this whole block (and everything it touches downstream) stays completely out
  // of the way unless a cashier explicitly opens it. Gift-voucher model, not a customer
  // account (see migrations/011_store_credit_vouchers.sql) — redeeming just needs the code
  // printed on a refund slip (REF-XXXXXX), no customer lookup/selection involved.
  const [showStoreCredit, setShowStoreCredit] = useState(false);
  const [storeCreditCode, setStoreCreditCode] = useState("");
  const [storeCreditBalance, setStoreCreditBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [voucherError, setVoucherError] = useState(false);
  const [storeCreditAmount, setStoreCreditAmount] = useState("");
  // Held (parked) sales — a customer steps away to fetch something, the next one is served
  // meanwhile. Per user and per device (utils/posMemory.js).
  const [heldSales, setHeldSales] = useState(() => loadHeldSales(user?.id));
  const [showHeld, setShowHeld] = useState(false);

  useEffect(() => {
    setHeldSales(loadHeldSales(user?.id));
  }, [user?.id]);

  const subtotal = cart.reduce((total, item) => total + lineTotal(item), 0);
  const itemCount = cart.reduce((sum, item) => sum + item.sellingQuantity, 0);

  // Debounced — this is a free-text field the cashier types into, unlike the old contact
  // dropdown (which only ever fired on a discrete selection), so looking up on every
  // keystroke would fire a request per character.
  useEffect(() => {
    const code = storeCreditCode.trim();
    if (!code) {
      setStoreCreditBalance(null);
      setVoucherError(false);
      return;
    }
    setLoadingBalance(true);
    setVoucherError(false);
    const timer = setTimeout(() => {
      apiGet(`/api/store-credit/lookup/${encodeURIComponent(code)}`)
        .then((res) => setStoreCreditBalance(res.balance))
        .catch(() => {
          setStoreCreditBalance(null);
          setVoucherError(true);
        })
        .finally(() => setLoadingBalance(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [storeCreditCode]);

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
  // Bank transfer has no tendered-amount concept (same as card) — the QR is generated for
  // the exact amount due, nothing for the cashier to compare against on this screen.
  const canConfirm = amountDue <= 0 || paymentMethod !== "cash" || tenderedNum >= amountDue;

  // Bank transfer needs a live connection to reach the server and generate a real, checkable
  // QR — there's no sensible offline story for it (unlike cash/card, which queue via the
  // offline outbox). If connectivity drops while it's selected, fall back to cash rather
  // than leaving a now-unavailable option selected.
  useEffect(() => {
    if (!online && paymentMethod === "bank_transfer") setPaymentMethod("cash");
  }, [online, paymentMethod]);

  const openPayment = () => {
    if (cart.length === 0) return;
    setPaymentMethod("cash");
    setAmountTendered("");
    setShowStoreCredit(false);
    setStoreCreditCode("");
    setStoreCreditAmount("");
    setShowPayment(true);
  };

  useEffect(() => {
    if (!hotkeys) return;
    const onKey = (e) => {
      if (e.key === "F4") {
        e.preventDefault();
        openPayment();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotkeys, cart.length]);

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
      // voucherCode/storeCreditRedeemed are both omitted entirely (undefined, not just falsy)
      // unless the cashier actually opened "Have a store credit voucher?" and applied some —
      // checkoutSale on the backend treats their absence as a completely ordinary walk-in
      // sale, same as before store credit existed.
      const checkoutPayload = {
        items: salesData,
        paymentMethod,
        voucherCode: creditToApply > 0 ? storeCreditCode.trim() : undefined,
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

      rememberPrices(cart);
      dispatch(clearCart());
      setShowPayment(false);
      onSold?.();
      toast.success(
        wentOffline
          ? `Saved offline — will sync automatically once connection is back. Total: ${formatPKR(subtotal)}.`
          : paymentMethod === "cash" && changeDue > 0
          ? `Sold for ${formatPKR(subtotal)}. Change due: ${formatPKR(changeDue)}.`
          : creditToApply > 0
          ? `Sold for ${formatPKR(subtotal)} — ${formatPKR(creditToApply)} paid via store credit.`
          : `Sold for ${formatPKR(subtotal)}.`
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
      // Stays 0 for an offline-queued sale — the redemption hasn't actually happened yet
      // (it's only re-validated for real once the queued checkout reaches the server), so
      // claiming it on the receipt now would be misleading, same reasoning as receiptNo
      // staying null until sync.
      setReceiptCreditApplied(wentOffline ? 0 : creditToApply);

      // onCheckedOut is NOT called here — it collapses the mobile bottom sheet / floating
      // cart this component is rendered inside of, and since ReceiptPreviewModal isn't a
      // portal, firing it now would unmount the receipt modal in the same instant it was
      // supposed to appear. Deferred to the modal's own onClose instead (below).
    } catch (error) {
      toast.error(error.message);
      refreshShift();
    } finally {
      setIsProcessing(false);
    }
  };

  // Opens a pending bank-transfer payment instead of an immediate sale — see
  // ExpressBackend/Sevices/bankPaymentService.js's createIntent. Unlike handleCheckout,
  // nothing is sold/decremented yet: that only happens once the payment is actually
  // confirmed (Pending Bank Payments page, or an eventual auto-matcher), so the cart is
  // cleared here purely so the cashier can move on to the next customer — the sale itself
  // isn't final until confirmed.
  const handleBankTransferCheckout = async () => {
    setIsCreatingBankIntent(true);

    const salesData = cart.map((item) => ({
      sellingPrice: item.sellingPrice,
      quantity: item.sellingQuantity,
      productID: item.productId || item.id,
      lotId: item.lotId,
    }));

    try {
      const intent = await apiPost("/api/bank-payments/intents", {
        items: salesData,
        voucherCode: creditToApply > 0 ? storeCreditCode.trim() : undefined,
        storeCreditRedeemed: creditToApply > 0 ? creditToApply : undefined,
      });

      rememberPrices(cart);
      dispatch(clearCart());
      setShowPayment(false);
      setBankIntent(intent);
      setShowBankQr(true);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsCreatingBankIntent(false);
    }
  };

  const confirmPayment = paymentMethod === "bank_transfer" ? handleBankTransferCheckout : handleCheckout;
  const paymentBusy = isProcessing || isCreatingBankIntent;

  // --- Hold / resume / clear ------------------------------------------------------------
  const persistHeld = (next) => {
    setHeldSales(next);
    saveHeldSales(user?.id, next);
  };

  const holdCurrent = (existing = heldSales) => {
    if (cart.length === 0) return existing;
    if (existing.length >= MAX_HELD_SALES) {
      toast.warning(t("register.heldFull", { n: MAX_HELD_SALES }));
      return null;
    }
    const next = [...existing, { id: Date.now(), heldAt: new Date().toISOString(), lines: cart }];
    persistHeld(next);
    dispatch(clearCart());
    return next;
  };

  const handleHold = () => {
    if (holdCurrent()) toast.success(t("register.heldSaved"));
  };

  const handleResume = (sale) => {
    // Whatever's on screen now gets parked first rather than silently lost.
    const afterHold = holdCurrent();
    if (!afterHold) return;
    persistHeld(afterHold.filter((s) => s.id !== sale.id));
    dispatch(replaceCart(sale.lines));
    setShowHeld(false);
  };

  const handleDiscardHeld = (sale) => persistHeld(heldSales.filter((s) => s.id !== sale.id));

  const handleClear = () => {
    if (cart.length > 0 && window.confirm(t("register.clearConfirm"))) dispatch(clearCart());
  };

  const shiftWarning = needsShift && (
    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
      <HiOutlineClock className="shrink-0 text-base" />
      <p className="flex-1 font-semibold">{t("register.noShiftWarning")}</p>
      <button
        type="button"
        onClick={() => setShowOpenShift(true)}
        className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 font-semibold text-white-A700 transition-colors hover:bg-amber-700"
      >
        {t("shifts.openShift")}
      </button>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-surface-border px-4 py-3 dark:border-gray-700">
        <div className="min-w-0">
          <p className="font-poppins font-bold text-gray-800 dark:text-gray-100">{t("register.currentSale")}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {itemCount === 1 ? t("register.oneItem") : t("register.itemsCount", { n: itemCount })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowHeld(true)}
            title={t("register.heldTitle")}
            className="relative flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-surface-muted dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <HiOutlineClock className="text-base" />
            {t("register.held")}
            {heldSales.length > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white-A700">
                {heldSales.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleHold}
            disabled={cart.length === 0}
            title={t("register.hold")}
            className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-surface-muted disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <HiOutlinePause className="text-base" />
            {t("register.hold")}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={cart.length === 0}
            title={t("register.clearSale")}
            aria-label={t("register.clearSale")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-danger-600 transition-colors hover:bg-danger-50 disabled:opacity-40 dark:hover:bg-danger-500/10"
          >
            <HiOutlineTrash className="text-base" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close cart"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <HiChevronDown className="text-lg" />
            </button>
          )}
        </div>
      </div>

      {shiftWarning && <div className="px-4 pt-3">{shiftWarning}</div>}

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
            <HiOutlineShoppingBag className="text-5xl text-gray-300 dark:text-gray-600" />
            <p className="font-medium text-gray-500 dark:text-gray-400">{t("cart.empty")}</p>
            <p className="max-w-[16rem] text-sm text-gray-400 dark:text-gray-500">{t("cart.emptyHint")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-border dark:divide-gray-700">
            {cart.map((item) => {
              const belowCost = item.costPrice > 0 && item.sellingPrice < item.costPrice;
              return (
                <li key={item.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="clamp-2 text-sm font-semibold leading-snug text-gray-800 dark:text-gray-100">
                        {item.productname}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.lotCode && (
                          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                            {item.lotCode}
                          </span>
                        )}
                        {belowCost && (
                          <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-semibold text-danger-600 dark:bg-danger-500/10 dark:text-danger-500">
                            {t("register.belowCost")}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => dispatch(removeCart(item.id))}
                      aria-label={t("cart.remove")}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/10"
                    >
                      <HiOutlineXMark />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => dispatch(decreaseQuantity({ id: item.id }))}
                        aria-label="Decrease quantity"
                        className={stepButtonClass}
                      >
                        <HiOutlineMinus className="text-sm" />
                      </button>
                      <InlineNumber
                        value={item.sellingQuantity}
                        ariaLabel={t("sell.quantity")}
                        onCommit={(qty) => dispatch(setQuantity({ id: item.id, quantity: qty }))}
                        className="h-8 w-12 rounded-lg border border-surface-border bg-white-A700 text-center text-sm font-semibold text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                      />
                      <button
                        type="button"
                        onClick={() => dispatch(increaseQuantity(item))}
                        aria-label="Increase quantity"
                        className={stepButtonClass}
                      >
                        <HiOutlinePlus className="text-sm" />
                      </button>
                      <span className="mx-0.5 text-xs text-gray-400">×</span>
                      <InlineNumber
                        value={item.sellingPrice}
                        ariaLabel={t("register.editPrice")}
                        onCommit={(price) => dispatch(setPrice({ id: item.id, price }))}
                        className={`h-8 w-20 rounded-lg border bg-white-A700 px-1.5 text-right text-sm font-semibold focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-gray-900 ${
                          belowCost
                            ? "border-danger-500 text-danger-600"
                            : "border-surface-border text-gray-800 dark:border-gray-600 dark:text-gray-100"
                        }`}
                      />
                    </div>
                    <span className="shrink-0 font-poppins text-sm font-bold text-gray-800 dark:text-gray-100">
                      {formatPKR(lineTotal(item))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-surface-border px-4 py-4 dark:border-gray-700">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">{t("cart.subtotal")}</span>
          <span className="font-poppins text-2xl font-bold text-gray-800 dark:text-gray-100">{formatPKR(subtotal)}</span>
        </div>
        <button
          type="button"
          onClick={openPayment}
          disabled={cart.length === 0}
          className="flex h-14 w-full items-center justify-between rounded-xl bg-primary-600 px-5 font-poppins text-lg font-bold text-white-A700 shadow-md shadow-primary-900/20 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          <span>
            {t("register.pay")}
            {hotkeys && <span className="ml-2 rounded bg-white-A700/20 px-1.5 py-0.5 text-xs font-semibold">F4</span>}
          </span>
          <span>{formatPKR(subtotal)}</span>
        </button>
      </div>

      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title={t("payment.title")} maxWidth="max-w-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canConfirm && !paymentBusy) confirmPayment();
          }}
        >
          {shiftWarning && <div className="mb-5">{shiftWarning}</div>}
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-1">
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl bg-surface-subtle px-5 py-4 dark:bg-gray-900/40">
                {creditToApply > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
                      <span>{t("cart.subtotal")}</span>
                      <span>{formatPKR(subtotal)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-primary-600 dark:text-primary-400">
                      <span>{t("payment.storeCreditApplied")}</span>
                      <span>- {formatPKR(creditToApply)}</span>
                    </div>
                    <div className="my-2 border-t border-dashed border-surface-border dark:border-gray-700" />
                  </>
                )}
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("payment.amountDue")}
                </p>
                <p className="font-poppins text-4xl font-bold text-gray-800 dark:text-gray-100">{formatPKR(amountDue)}</p>
              </div>

              <div className={`grid gap-2 ${online && hasBankTransfer ? "grid-cols-3" : "grid-cols-2"}`}>
                <button type="button" onClick={() => setPaymentMethod("cash")} className={methodTileClass(paymentMethod === "cash")}>
                  <HiOutlineBanknotes className="text-xl" />
                  {t("payment.cash")}
                </button>
                <button type="button" onClick={() => setPaymentMethod("card")} className={methodTileClass(paymentMethod === "card")}>
                  <HiOutlineCreditCard className="text-xl" />
                  {t("payment.card")}
                </button>
                {/* Hidden while offline — a QR needs a live server round-trip to generate and be
                    checkable, unlike cash/card which queue through the offline outbox. Also
                    hidden below Smart tier (`bankTransfer`) — a Basic shop has no way to receive
                    a bank transfer set up, so offering the option would just lead to a 403. */}
                {online && hasBankTransfer && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("bank_transfer")}
                    className={methodTileClass(paymentMethod === "bank_transfer")}
                  >
                    <HiOutlineQrCode className="text-xl" />
                    {t("payment.bankTransfer")}
                  </button>
                )}
              </div>
              {!online && hasBankTransfer && (
                <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">{t("payment.bankTransferUnavailableOffline")}</p>
              )}

              {/* Smart-tier+ (`storeCredit`) — a Basic shop has never issued a voucher, so there's
                  nothing a code here could ever redeem. */}
              {hasStoreCredit && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowStoreCredit((v) => !v)}
                    className="text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
                  >
                    {showStoreCredit ? t("payment.hideStoreCredit") : t("payment.haveVoucherCode")}
                  </button>
                  {showStoreCredit && (
                    <div className="mt-2 rounded-xl border border-dashed border-surface-border p-3 dark:border-gray-700">
                      <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {t("payment.voucherCode")}
                      </label>
                      <input
                        type="text"
                        value={storeCreditCode}
                        onChange={(e) => setStoreCreditCode(e.target.value)}
                        placeholder="REF-000123"
                        className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      />
                      {storeCreditCode.trim() && (
                        <div className="mt-2">
                          {loadingBalance ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{t("payment.loadingBalance")}</p>
                          ) : voucherError ? (
                            <p className="text-xs text-danger-600 dark:text-danger-400">{t("payment.invalidVoucherCode")}</p>
                          ) : (
                            <>
                              <p className="text-xs text-gray-600 dark:text-gray-300">
                                {t("payment.availableCredit")}: {formatPKR(storeCreditBalance)}
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
                </div>
              )}

              {amountDue <= 0 && (
                <div className="rounded-xl bg-success-50 px-4 py-3 text-sm font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-500">
                  {t("payment.fullyCoveredByCredit")}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {paymentMethod === "cash" && amountDue > 0 ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {t("payment.amountReceived")}
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-gray-400">
                        PKR
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={amountTendered}
                        onChange={(e) => setAmountTendered(e.target.value.replace(/[^\d]/g, ""))}
                        placeholder={t("payment.amountReceivedPlaceholder")}
                        autoFocus
                        className="no-spin h-14 w-full rounded-xl border border-surface-border bg-white-A700 pl-12 pr-3 text-right font-poppins text-2xl font-bold text-gray-900 placeholder:text-sm placeholder:font-normal focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tenderSuggestions(amountDue).map((amount, i) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setAmountTendered(String(amount))}
                        className="rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                      >
                        {i === 0 ? `${t("register.exact")} · ` : ""}
                        {formatPKR(amount)}
                      </button>
                    ))}
                  </div>
                  <Numpad value={amountTendered} onChange={setAmountTendered} />
                  <div
                    className={`flex items-center justify-between rounded-xl px-4 py-3 font-semibold ${
                      amountTendered === ""
                        ? "bg-surface-muted text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                        : changeDue >= 0
                        ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500"
                        : "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400"
                    }`}
                  >
                    <span className="text-sm">{changeDue >= 0 ? t("payment.changeDue") : t("payment.amountShort")}</span>
                    <span className="font-poppins text-2xl">{formatPKR(Math.abs(amountTendered === "" ? 0 : changeDue))}</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-surface-border p-6 text-center dark:border-gray-700">
                  {paymentMethod === "card" ? (
                    <HiOutlineCreditCard className="text-4xl text-gray-400" />
                  ) : paymentMethod === "bank_transfer" ? (
                    <HiOutlineQrCode className="text-4xl text-gray-400" />
                  ) : (
                    <HiOutlineBanknotes className="text-4xl text-gray-400" />
                  )}
                  <p className="font-poppins text-2xl font-bold text-gray-800 dark:text-gray-100">{formatPKR(amountDue)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Pinned to the bottom of the modal's scroll area so Complete sale is never below the
              fold on a short screen. -mx/-mb cancel the Modal body's own padding. */}
          <div className="sticky bottom-0 -mx-6 -mb-5 mt-6 flex gap-3 border-t border-surface-border bg-white-A700 px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setShowPayment(false)}
              className="h-14 flex-1 rounded-xl bg-surface-muted font-semibold text-gray-800 transition-colors hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
            >
              {t("payment.cancel")}
            </button>
            <button
              type="submit"
              disabled={!canConfirm || paymentBusy}
              className="h-14 flex-[2] rounded-xl bg-primary-600 font-poppins text-lg font-bold text-white-A700 shadow-md shadow-primary-900/20 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {paymentBusy ? t("payment.processing") : `${t("register.completeSale")} · ${formatPKR(amountDue)}`}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showHeld} onClose={() => setShowHeld(false)} title={t("register.heldTitle")}>
        {heldSales.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t("register.heldEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...heldSales].reverse().map((sale) => {
              const count = sale.lines.reduce((sum, line) => sum + line.sellingQuantity, 0);
              const total = sale.lines.reduce((sum, line) => sum + lineTotal(line), 0);
              return (
                <li
                  key={sale.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-4 py-3 dark:border-gray-700"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">{formatPKR(total)}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {count === 1 ? t("register.oneItem") : t("register.itemsCount", { n: count })} ·{" "}
                      {formatDateTime(sale.heldAt, { timeStyle: "short" })} · {sale.lines.map((l) => l.productname).join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => handleDiscardHeld(sale)}
                      className="rounded-lg px-3 py-2 text-xs font-semibold text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                    >
                      {t("register.discard")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResume(sale)}
                      className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white-A700 hover:bg-primary-700"
                    >
                      {t("register.resume")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <OpenShiftModal
        isOpen={showOpenShift}
        onClose={() => setShowOpenShift(false)}
        onOpened={() => {
          setShowOpenShift(false);
          refreshShift();
        }}
      />

      <BankTransferQrModal
        isOpen={showBankQr}
        intent={bankIntent}
        onClose={() => {
          setShowBankQr(false);
          setBankIntent(null);
          onCheckedOut?.();
        }}
      />

      <ReceiptPreviewModal
        isOpen={receiptItems !== null}
        onClose={() => {
          setReceiptItems(null);
          setReceiptNo(null);
          setReceiptCreditApplied(0);
          onCheckedOut?.();
        }}
        items={receiptItems || []}
        totalAmount={receiptTotal}
        receiptNo={receiptNo}
        creditApplied={receiptCreditApplied}
      />
    </div>
  );
}
