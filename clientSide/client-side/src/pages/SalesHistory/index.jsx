import React, { useEffect, useState } from "react";
import { Text, EmptyState } from "components";
import {
  HiOutlineClipboardDocumentList,
  HiOutlinePrinter,
  HiChevronLeft,
  HiChevronRight,
  HiChevronDown,
} from "react-icons/hi2";
import { printReceipt } from "utils/printReceipt";
import AppShell from "components/AppShell";
import { apiGet } from "utils/api";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";

const PAGE_SIZE = 30;

const batchTotal = (batch) =>
  batch.reduce((sum, sale) => sum + sale.selling_price * sale.quantity, 0);

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

// Windowed page numbers with ellipses, e.g. 1 ... 4 5 [6] 7 8 ... 12
const getPageNumbers = (current, total) => {
  const pages = [];
  const window = 1;
  const add = (p) => pages.push(p);

  add(1);
  if (current - window > 2) add("...");
  for (let p = Math.max(2, current - window); p <= Math.min(total - 1, current + window); p++) {
    add(p);
  }
  if (current + window < total - 1) add("...");
  if (total > 1) add(total);

  return pages;
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
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-surface-border dark:divide-gray-800">
                                    {batch.map((sale) => (
                                      <tr key={sale.id}>
                                        <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
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
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || loading}
                className="p-2 rounded-lg border border-surface-border dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-surface-subtle dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <HiChevronLeft />
              </button>
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-gray-400 select-none">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    disabled={loading}
                    className={`min-w-[2.25rem] px-2 py-2 text-sm font-semibold rounded-lg transition-colors ${
                      p === page
                        ? "bg-primary-600 text-white-A700"
                        : "border border-surface-border dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-surface-subtle dark:hover:bg-gray-800"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages || loading}
                className="p-2 rounded-lg border border-surface-border dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-surface-subtle dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <HiChevronRight />
              </button>
            </div>
          </div>
        )}
      </AppShell>
    </>
  );
}
