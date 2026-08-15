import React, { useEffect, useState } from "react";
import { Text, EmptyState, Pagination, Modal } from "components";
import {
  HiOutlineClipboardDocumentList,
  HiOutlinePrinter,
  HiOutlineNoSymbol,
  HiChevronDown,
} from "react-icons/hi2";
import { printReceipt } from "utils/printReceipt";
import AppShell from "components/AppShell";
import { apiGet, apiPatch } from "utils/api";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";

const PAGE_SIZE = 30;

// Voided lines are excluded from the collapsed row's headline total (they still show up,
// struck through, once expanded — see the expanded item table below) — otherwise the
// summary would keep counting a return that's already been reversed.
const batchTotal = (batch) =>
  batch.filter((sale) => !sale.is_voided).reduce((sum, sale) => sum + sale.selling_price * sale.quantity, 0);

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
  const [batches, setBatches] = useState([]);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState("");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null); // the sale line item being confirmed
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

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
  }, [startDate, endDate, categoryId]);

  const goToPage = (p) => {
    if (p < 1 || p > totalPages || p === page) return;
    fetchHistory(p);
  };

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
          {(startDate || endDate || categoryId) && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setCategoryId("");
              }}
              className="px-4 py-2.5 text-sm font-semibold rounded-lg border border-surface-border dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-surface-subtle dark:hover:bg-gray-800 transition-colors"
            >
              {t("salesHistory.clearFilter")}
            </button>
          )}
        </div>

        <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead className="bg-surface-subtle dark:bg-gray-800">
                <tr>
                  <th className="w-10 pl-5"></th>
                  <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("salesHistory.dateTime")}
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("salesHistory.items")}
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("salesHistory.total")}
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border dark:divide-gray-800">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4">
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
                          <td className="px-3 py-3 whitespace-nowrap text-gray-800 dark:text-gray-100">
                            {new Date(batch[0].sale_time).toLocaleString()}
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                              {batch.length} item{batch.length === 1 ? "" : "s"}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap font-medium text-gray-800 dark:text-gray-100">
                            Rs.{batchTotal(batch).toFixed(2)}
                          </td>
                          <td className="py-3 pr-5 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                printReceipt(batch, batchTotal(batch), { onFallback: toast.info });
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
                            <td colSpan={4} className="px-3 pb-4 pt-1">
                              <div className="overflow-x-auto rounded-xl border border-surface-border dark:border-gray-700 bg-white-A700 dark:bg-gray-900">
                                <table className="w-full min-w-[420px] border-collapse">
                                  <thead>
                                    <tr className="border-b border-surface-border dark:border-gray-700">
                                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("inventory.product")}
                                      </th>
                                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("salesHistory.buyingPrice")}
                                      </th>
                                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("salesHistory.sellingPrice")}
                                      </th>
                                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("inventory.qty")}
                                      </th>
                                      <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("salesHistory.lineTotal")}
                                      </th>
                                      <th className="w-24"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-surface-border dark:divide-gray-800">
                                    {batch.map((sale) => (
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
                                          {sale.is_voided ? (
                                            <span
                                              className="inline-flex rounded-full bg-surface-muted px-2 py-1 text-[11px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                                              title={sale.void_reason || ""}
                                            >
                                              {t("salesHistory.voidedBadge")}
                                            </span>
                                          ) : (
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
                                        </td>
                                      </tr>
                                    ))}
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
    </>
  );
}
