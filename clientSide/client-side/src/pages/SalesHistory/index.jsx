import React, { useEffect, useState } from "react";
import { Text, EmptyState, Pagination, Modal } from "components";
import {
  HiOutlineClipboardDocumentList,
  HiOutlinePrinter,
  HiOutlineNoSymbol,
  HiOutlineReceiptRefund,
  HiChevronDown,
} from "react-icons/hi2";
import { printReceipt } from "utils/printReceipt";
import AppShell from "components/AppShell";
import { apiGet, apiPatch, apiPost } from "utils/api";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { useTimezone } from "timezone/TimezoneContext";
import RefundReceiptModal from "categoriesComponents/RefundReceiptModal";

const REFUND_METHODS = ["cash", "card", "store_credit"];

const PAGE_SIZE = 30;

// Voided lines are excluded from the collapsed row's headline total (they still show up,
// struck through, once expanded — see the expanded item table below) — otherwise the
// summary would keep counting a return that's already been reversed.
const batchTotal = (batch) =>
  batch.filter((sale) => !sale.is_voided).reduce((sum, sale) => sum + sale.selling_price * sale.quantity, 0);

// One glance at the collapsed row should say whether anything in it was voided, instead
// of needing to expand every row (or apply the Status filter) just to find out — most
// transactions are a single item, so "confirmed" vs "voided" covers almost everything;
// "partial" is the rarer multi-item case where only some lines were returned.
const batchStatus = (batch) => {
  const voidedCount = batch.filter((sale) => sale.is_voided).length;
  if (voidedCount === 0) return "confirmed";
  if (voidedCount === batch.length) return "voided";
  return "partial";
};

const inputClass =
  "p-2.5 border border-surface-border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500";

// Local (not UTC) "YYYY-MM-DDTHH:mm" — the format <input type="datetime-local"> expects.
const formatLocal = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

// Default range = current week so far: today minus 6 days (00:00) through today (23:59).
// e.g. if today is Aug 7, start is Aug 1 and end is Aug 7.
const defaultStartDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  d.setHours(0, 0, 0, 0);
  return formatLocal(d);
};

const defaultEndDate = () => {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return formatLocal(d);
};

export default function SalesHistoryPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const { formatDateTime } = useTimezone();
  const [batches, setBatches] = useState([]);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState("");
  const [voidStatus, setVoidStatus] = useState("all");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null); // the sale line item being confirmed
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [receiptNoQuery, setReceiptNoQuery] = useState("");
  const [refundTarget, setRefundTarget] = useState(null); // the sale line item being refunded
  const [refundQuantity, setRefundQuantity] = useState(1);
  const [refundMethod, setRefundMethod] = useState("cash");
  const [refundCondition, setRefundCondition] = useState("resellable");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [refundReceipt, setRefundReceipt] = useState(null); // set after a successful refund, opens RefundReceiptModal

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setCategories(await apiGet("/categories"));
      } catch (error) {
        console.error("Error fetching categories:", error);
        toast.error("Couldn't load categories — check your connection and try again.");
      }
    };
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHistory = async (pageToFetch) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageToFetch,
        pageSize: PAGE_SIZE,
      });
      if (startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }
      if (categoryId) {
        params.set("categoryId", categoryId);
      }
      if (voidStatus !== "all") {
        params.set("voidStatus", voidStatus);
      }
      if (receiptNoQuery.trim()) {
        params.set("receiptNo", receiptNoQuery.trim());
      }

      const data = await apiGet(`/api/BilledHistory?${params.toString()}`);
      // Backend already returns most-recent-first, one page (30 transactions) at a time
      setBatches(data.batches);
      setTotalPages(data.totalPages);
      setTotalCount(data.totalCount);
      setPage(data.page);
      setExpandedIndex(null);
    } catch (error) {
      console.error("Error fetching sales history:", error);
      toast.error("Couldn't load sales history — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Filters changed -> restart from page 1
  useEffect(() => {
    fetchHistory(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, categoryId, voidStatus]);

  const goToPage = (p) => {
    if (p < 1 || p > totalPages || p === page) return;
    fetchHistory(p);
  };

  // Deliberately not wired into the auto-refetch useEffect above (unlike the other filters) —
  // a text field would otherwise refetch on every keystroke. Runs on Enter or the search
  // button instead, matching how a receipt-number lookup is actually used: a cashier types
  // (or scans) the whole number a customer hands them, then confirms it in one action.
  const runReceiptSearch = () => fetchHistory(1);

  // Void is per line item (one product from a checkout), not per whole transaction — a
  // customer returning one thing out of a multi-item sale is the common case, and the
  // backend's voidSale() already operates on a single sales.id. Anyone who can even *see*
  // a given row is already allowed to void it: a Cashier's history here is server-filtered
  // to their own sales from today only (see salesController.js's getBilledHistory), so
  // there's nothing extra to check client-side beyond "is it already voided."
  const handleVoid = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await apiPatch(`/api/sales/${voidTarget.id}/void`, { reason: voidReason || undefined });
      toast.success(t("salesHistory.voided"));
      setVoidTarget(null);
      setVoidReason("");
      fetchHistory(page);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setVoiding(false);
    }
  };

  // Any logged-in staff can refund any sale, any day (see refundSale in salesService.js) —
  // no client-side role/ownership gate to apply here, unlike void.
  const handleRefund = async () => {
    if (!refundTarget) return;
    setRefunding(true);
    try {
      const result = await apiPost(`/api/sales/${refundTarget.id}/refunds`, {
        quantity: Number(refundQuantity),
        refundAmount: refundAmount === "" ? undefined : Number(refundAmount),
        refundMethod,
        condition: refundCondition,
        reason: refundReason,
      });
      toast.success(t("salesHistory.refunded"));
      setRefundReceipt({
        productname: refundTarget.productname,
        quantity: Number(refundQuantity),
        amount: result.refund.refund_amount,
        refundMethod,
        condition: refundCondition,
        reason: refundReason,
        refundNo: result.refundNo,
        receiptNo: refundTarget.receipt_no,
      });
      setRefundTarget(null);
      fetchHistory(page);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRefunding(false);
    }
  };

  return (
    <>
      <AppShell title={t("salesHistory.title")}>
        <div className="w-full max-w-4xl mb-4 flex flex-wrap items-end gap-4 bg-white-A700 dark:bg-gray-900 rounded-xl2 p-4 border border-surface-border dark:border-gray-700">
          <div>
            <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1 text-sm">
              {t("salesHistory.startDate")}
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1 text-sm">
              {t("salesHistory.endDate")}
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1 text-sm">
              {t("salesHistory.category")}
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputClass}
            >
              <option value="">{t("salesHistory.allCategories")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.category_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1 text-sm">
              {t("salesHistory.status")}
            </label>
            <select
              value={voidStatus}
              onChange={(e) => setVoidStatus(e.target.value)}
              className={inputClass}
            >
              <option value="all">{t("salesHistory.statusAll")}</option>
              <option value="confirmed">{t("salesHistory.statusConfirmed")}</option>
              <option value="voided">{t("salesHistory.statusVoided")}</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1 text-sm">
              {t("salesHistory.receiptNo")}
            </label>
            <input
              type="text"
              value={receiptNoQuery}
              onChange={(e) => setReceiptNoQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runReceiptSearch()}
              placeholder="RCPT-000123"
              className={inputClass}
            />
          </div>
          <button
            onClick={runReceiptSearch}
            className="px-4 py-2.5 text-sm font-semibold rounded-lg border border-surface-border dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-surface-subtle dark:hover:bg-gray-800 transition-colors"
          >
            {t("salesHistory.search")}
          </button>
          {(startDate || endDate || categoryId || voidStatus !== "all" || receiptNoQuery) && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setCategoryId("");
                setVoidStatus("all");
                setReceiptNoQuery("");
                // The auto-refetch effect isn't keyed on receiptNoQuery (see runReceiptSearch's
                // comment), but startDate/endDate always have non-empty defaults, so clearing
                // them here always changes them too — that alone re-triggers the effect, which
                // picks up the now-cleared receiptNoQuery via fetchHistory's closure.
              }}
              className="px-4 py-2.5 text-sm font-semibold rounded-lg border border-surface-border dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-surface-subtle dark:hover:bg-gray-800 transition-colors"
            >
              {t("salesHistory.clearFilter")}
            </button>
          )}
        </div>

        <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
          <div className="w-full overflow-x-auto">
            {/* Explicit px widths on every column — table-layout:fixed is a global rule
                (styles/index.css) that otherwise splits leftover space evenly across
                however many columns exist, regardless of what each actually needs; adding
                the Status column without these pushed DATE/TIME too narrow for its own
                text ("15/08/2026, 18:55:40"), which then visually overlapped the Items
                badge next to it. min-w raised to fit all six comfortably — same
                min-w+overflow-x-auto pattern already used for narrower screens. */}
            <table className="w-full min-w-[720px] table-fixed border-collapse">
              <thead className="bg-surface-subtle dark:bg-gray-800">
                <tr>
                  <th className="w-10 pl-5"></th>
                  <th className="w-44 text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("salesHistory.dateTime")}
                  </th>
                  <th className="w-24 text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("salesHistory.items")}
                  </th>
                  <th className="w-36 text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("salesHistory.status")}
                  </th>
                  <th className="w-32 text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("salesHistory.total")}
                  </th>
                  <th className="w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border dark:divide-gray-800">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4">
                      <EmptyState
                        icon={HiOutlineClipboardDocumentList}
                        title={loading ? t("salesHistory.loading") : t("salesHistory.empty")}
                      />
                    </td>
                  </tr>
                ) : (
                  batches.map((batch, index) => {
                    const isExpanded = expandedIndex === index;
                    return (
                      <React.Fragment key={index}>
                        <tr
                          onClick={() => setExpandedIndex(isExpanded ? null : index)}
                          className="cursor-pointer transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60"
                        >
                          <td className="pl-5">
                            <HiChevronDown
                              className={`text-gray-400 transition-transform duration-200 ${
                                isExpanded ? "rotate-180 text-primary-600" : ""
                              }`}
                            />
                          </td>
                          <td className="px-3 py-3 text-gray-800 dark:text-gray-100">
                            <div className="truncate">{formatDateTime(batch[0].sale_time)}</div>
                            {/* null for legacy (pre-receipt-number) batches — nothing to show there */}
                            {batch[0].receipt_no && (
                              <div className="truncate text-xs font-normal text-gray-400 dark:text-gray-500">
                                {batch[0].receipt_no}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                              {batch.length} item{batch.length === 1 ? "" : "s"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {batchStatus(batch) === "confirmed" ? (
                              <span className="inline-flex rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-600 dark:bg-success-500/10 dark:text-success-500">
                                {t("salesHistory.statusConfirmed")}
                              </span>
                            ) : batchStatus(batch) === "voided" ? (
                              <span className="inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                                {t("salesHistory.statusVoided")}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                                {t("salesHistory.statusPartial")}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap font-medium text-gray-800 dark:text-gray-100">
                            Rs.{batchTotal(batch).toFixed(2)}
                          </td>
                          <td className="py-3 pr-5 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                printReceipt(batch, batchTotal(batch), batch[0]?.receipt_no, {
                                  onFallback: toast.info,
                                });
                              }}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white-A700 text-xs font-bold uppercase rounded-lg transition-colors"
                            >
                              <HiOutlinePrinter />
                              {t("salesHistory.print")}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-surface-subtle dark:bg-gray-800/40">
                            <td></td>
                            <td colSpan={5} className="px-3 pb-4 pt-1">
                              <div className="overflow-x-auto rounded-xl border border-surface-border dark:border-gray-700 bg-white-A700 dark:bg-gray-900">
                                {/* Explicit px width on every column, same fix as the outer table
                                    (see its comment above) — table-layout:fixed is a GLOBAL rule
                                    (styles/index.css), so it applies here too. The actions column
                                    used to only ever hold one "Void" button at w-24 (96px); adding
                                    a second Refund button next to it without widening this column
                                    overflowed both buttons' text into the Line Total column right
                                    next to it. Widened + min-w raised accordingly. */}
                                <table className="w-full min-w-[800px] table-fixed border-collapse">
                                  <thead>
                                    <tr className="border-b border-surface-border dark:border-gray-700">
                                      <th className="w-52 text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("inventory.product")}
                                      </th>
                                      <th className="w-24 text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("salesHistory.buyingPrice")}
                                      </th>
                                      <th className="w-24 text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("salesHistory.sellingPrice")}
                                      </th>
                                      <th className="w-16 text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("inventory.qty")}
                                      </th>
                                      <th className="w-28 text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("salesHistory.lineTotal")}
                                      </th>
                                      <th className="w-56"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-surface-border dark:divide-gray-800">
                                    {batch.map((sale) => {
                                      const remaining = sale.quantity - (sale.refunded_quantity || 0);
                                      const hasRefunds = (sale.refunded_quantity || 0) > 0;
                                      return (
                                      <tr key={sale.id} className={sale.is_voided ? "opacity-50" : ""}>
                                        <td
                                          className={`px-3 py-2 text-gray-800 dark:text-gray-100 ${
                                            sale.is_voided ? "line-through" : ""
                                          }`}
                                        >
                                          {sale.productname}
                                          {sale.lot_code && (
                                            <span className="ml-2 inline-flex rounded-full bg-primary-50 dark:bg-primary-900/40 px-2 py-0.5 text-[11px] font-semibold text-primary-700 dark:text-primary-300">
                                              Lot: {sale.lot_code}
                                            </span>
                                          )}
                                          {/* Always derived from refunds, never a flag on the sale row itself
                                              — see refundSale/fetchBilledHistory in salesService.js. */}
                                          {hasRefunds && (
                                            <div className="mt-0.5 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                                              {t("salesHistory.refundedNote", {
                                                refunded: sale.refunded_quantity,
                                                total: sale.quantity,
                                              })}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                                          Rs.{sale.buying_price}
                                        </td>
                                        <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                                          Rs.{sale.selling_price}
                                        </td>
                                        <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                                          {sale.quantity}
                                        </td>
                                        <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">
                                          Rs.{(sale.selling_price * sale.quantity).toFixed(2)}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <div className="flex justify-end gap-1.5">
                                            {sale.is_voided ? (
                                              <span
                                                className="inline-flex rounded-full bg-surface-muted px-2 py-1 text-[11px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                                                title={sale.void_reason || ""}
                                              >
                                                {t("salesHistory.voidedBadge")}
                                              </span>
                                            ) : (
                                              <>
                                                {/* Hidden once any refund exists on this line — void and
                                                    refund are kept non-overlapping, see voidSale's own
                                                    refund check in salesService.js (real enforcement is
                                                    server-side; this is a UX hint only). */}
                                                {!hasRefunds && (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setVoidTarget(sale);
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger-600 transition-colors hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-500/10"
                                                  >
                                                    <HiOutlineNoSymbol className="text-sm" />
                                                    {t("salesHistory.void")}
                                                  </button>
                                                )}
                                                {remaining > 0 && (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setRefundTarget(sale);
                                                      setRefundQuantity(remaining);
                                                      setRefundMethod("cash");
                                                      setRefundCondition("resellable");
                                                      setRefundAmount("");
                                                      setRefundReason("");
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-500/10"
                                                  >
                                                    <HiOutlineReceiptRefund className="text-sm" />
                                                    {t("salesHistory.refund")}
                                                  </button>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {totalCount > 0 && (
          <div className="w-full max-w-4xl mt-4 flex flex-wrap items-center justify-between gap-3">
            <Text as="p" className="text-sm !text-gray-500 dark:!text-gray-400">
              {totalCount} transaction{totalCount === 1 ? "" : "s"} · Page {page} of {totalPages}
            </Text>
            <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} loading={loading} />
          </div>
        )}
      </AppShell>

      <Modal
        isOpen={!!voidTarget}
        onClose={() => {
          setVoidTarget(null);
          setVoidReason("");
        }}
        title={t("salesHistory.voidConfirmTitle")}
      >
        {voidTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-subtle p-3 text-sm dark:bg-gray-900/40">
              {voidTarget.receipt_no && (
                <p className="mb-1 text-xs font-semibold text-gray-400 dark:text-gray-500">
                  {t("salesHistory.receiptNo")}: {voidTarget.receipt_no}
                </p>
              )}
              <p className="font-semibold text-gray-800 dark:text-gray-100">{voidTarget.productname}</p>
              <p className="text-gray-500 dark:text-gray-400">
                {voidTarget.quantity} × Rs.{voidTarget.selling_price} = Rs.
                {(voidTarget.selling_price * voidTarget.quantity).toFixed(2)}
              </p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t("salesHistory.voidConfirmBody")}</p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                {t("salesHistory.voidReasonLabel")}
              </label>
              <textarea
                rows={2}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder={t("salesHistory.voidReasonPlaceholder")}
                className="w-full resize-y rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setVoidTarget(null);
                  setVoidReason("");
                }}
                disabled={voiding}
                className="rounded-lg bg-surface-muted px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-surface-border disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
              >
                {t("sell.cancel")}
              </button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={voiding}
                className="rounded-lg bg-danger-600 px-4 py-2 text-sm font-semibold text-white-A700 transition-colors hover:bg-danger-700 disabled:opacity-50"
              >
                {voiding ? t("salesHistory.voiding") : t("salesHistory.voidConfirmButton")}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!refundTarget}
        onClose={() => setRefundTarget(null)}
        title={t("salesHistory.refundConfirmTitle")}
      >
        {refundTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-subtle p-3 text-sm dark:bg-gray-900/40">
              {refundTarget.receipt_no && (
                <p className="mb-1 text-xs font-semibold text-gray-400 dark:text-gray-500">
                  {t("salesHistory.receiptNo")}: {refundTarget.receipt_no}
                </p>
              )}
              <p className="font-semibold text-gray-800 dark:text-gray-100">{refundTarget.productname}</p>
              <p className="text-gray-500 dark:text-gray-400">
                {t("salesHistory.refundRemaining", {
                  remaining: refundTarget.quantity - (refundTarget.refunded_quantity || 0),
                  total: refundTarget.quantity,
                })}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {t("salesHistory.refundQuantity")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={refundTarget.quantity - (refundTarget.refunded_quantity || 0)}
                  value={refundQuantity}
                  onChange={(e) => setRefundQuantity(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {t("salesHistory.refundAmountOverride")}
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder={`Rs.${(Number(refundQuantity) * refundTarget.selling_price).toFixed(2)}`}
                  className="w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {t("salesHistory.refundMethod")}
                </label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  {REFUND_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m === "cash" ? t("salesHistory.methodCash") : m === "card" ? t("salesHistory.methodCard") : t("salesHistory.methodStoreCredit")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {t("salesHistory.refundCondition")}
                </label>
                <select
                  value={refundCondition}
                  onChange={(e) => setRefundCondition(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="resellable">{t("salesHistory.conditionResellable")}</option>
                  <option value="damaged">{t("salesHistory.conditionDamaged")}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                {t("salesHistory.refundReasonLabel")}
              </label>
              <textarea
                rows={2}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder={t("salesHistory.refundReasonPlaceholder")}
                className="w-full resize-y rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                disabled={refunding}
                className="rounded-lg bg-surface-muted px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-surface-border disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
              >
                {t("sell.cancel")}
              </button>
              <button
                type="button"
                onClick={handleRefund}
                disabled={refunding || !refundReason.trim() || !refundQuantity}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {refunding ? t("salesHistory.refunding") : t("salesHistory.refundConfirmButton")}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <RefundReceiptModal
        isOpen={!!refundReceipt}
        onClose={() => setRefundReceipt(null)}
        refund={refundReceipt}
      />
    </>
  );
}
