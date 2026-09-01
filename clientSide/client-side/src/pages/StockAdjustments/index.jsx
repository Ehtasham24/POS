import React, { useEffect, useState } from "react";
import useUrlFilterState from "hooks/useUrlFilterState";
import {
  HiOutlineArchiveBoxXMark,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineXMark,
} from "react-icons/hi2";
import AppShell from "components/AppShell";
import { EmptyState, SkeletonRows } from "components";
import Pagination from "components/Pagination";
import { useLanguage } from "i18n/LanguageContext";
import { useTimezone } from "timezone/TimezoneContext";
import { useToast } from "components/Toast/ToastContext";
import { apiGet } from "utils/api";

// The Sales Report's own date range is datetime-local ("YYYY-MM-DDTHH:mm"); this page's
// own date filter is plain date-only, one step coarser — "View Detail" links land here with
// the former, so it's truncated to what this page's <input type="date"> can actually
// display. Never loses anything in practice: the Report's own default ranges (and the vast
// majority of real use) are whole-day windows anyway, where date-only covers the identical
// period.
const toDateOnly = (value) => (value ? value.split("T")[0] : "");

const REASON_LABEL_KEY = {
  restock: "inventory.adjustStockReasonRestock",
  damaged: "inventory.adjustStockReasonDamaged",
  expired: "inventory.adjustStockReasonExpired",
  theft: "inventory.adjustStockReasonTheft",
  count_correction: "inventory.adjustStockReasonCountCorrection",
  other: "inventory.adjustStockReasonOther",
};

const REASON_FILTER_OPTIONS = Object.keys(REASON_LABEL_KEY);

const inputClass =
  "h-10 rounded-xl border border-surface-border bg-surface-subtle px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

// Full history of every stock adjustment (Sevices/stockAdjustmentService.js) — restocks,
// damage, expiry, theft, count corrections — each with its reason/note/who, and, when it's
// against a lot, the full chain back to that lot's own delivery: vendor, when it arrived, and
// who accepted it (lots.received_by). Owner-only, matching the rest of Inventory.
export default function StockAdjustmentsPage() {
  const { t } = useLanguage();
  const { formatDateTime } = useTimezone();
  const toast = useToast();

  // URL-backed (hooks/useUrlFilterState) — this is both how the Sales Report's Shrinkage
  // section ("View Detail" on a reason or a product row, ShrinkageSummary.jsx) lands here
  // already scoped to exactly that reason/product and date range, AND how a filter change
  // made on this page itself survives navigating away and back (a plain useState would
  // reset to these same defaults on remount, same class of bug this fixes on Report.jsx).
  const [adjustments, setAdjustments] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [reasonFilter, setReasonFilter] = useUrlFilterState("reasonCode", "all");
  const [startDateRaw, setStartDate] = useUrlFilterState("startDate", "");
  const [endDateRaw, setEndDate] = useUrlFilterState("endDate", "");
  // toDateOnly is a safe no-op on an already-date-only value (no "T" to split on), so this
  // normalizes both a fresh datetime-local value arriving from Report.jsx's own filters and
  // a plain date this page's own <input type="date"> sets directly.
  const startDate = toDateOnly(startDateRaw);
  const endDate = toDateOnly(endDateRaw);
  const [productFilter, setProductFilter] = useUrlFilterState("productId", "");
  const [expandedId, setExpandedId] = useState(null);

  const fetchAdjustments = async (pageToLoad) => {
    try {
      const params = new URLSearchParams();
      if (reasonFilter !== "all") params.set("reasonCode", reasonFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (productFilter) params.set("productId", productFilter);
      params.set("page", pageToLoad);
      params.set("pageSize", PAGE_SIZE);
      const result = await apiGet(`/api/stock-adjustments?${params.toString()}`);
      setAdjustments(result.adjustments);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch (error) {
      toast.error(error.message || "Couldn't load stock adjustments.");
    }
  };

  // Any filter change starts back at page 1 — a stale page number from a much longer
  // unfiltered list could otherwise land past the end of a newly-narrowed result set.
  useEffect(() => {
    fetchAdjustments(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasonFilter, startDate, endDate, productFilter]);

  return (
    <AppShell title={t("stockAdjustments.title")}>
      {/* w-44/w-40 are deliberate — @tailwindcss/forms' base reset makes a bare
          type="date" input stretch to width:100%, so it fills the whole flex row edge to
          edge without an explicit width (confirmed live: this was exactly the reported
          bug). <select> isn't affected by that reset but still gets a width so it doesn't
          resize with whichever option is selected. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={`${inputClass} w-44`}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={`${inputClass} w-44`}
        />
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className={`${inputClass} w-48`}
        >
          <option value="all">{t("stockAdjustments.allReasons")}</option>
          {REASON_FILTER_OPTIONS.map((code) => (
            <option key={code} value={code}>
              {t(REASON_LABEL_KEY[code])}
            </option>
          ))}
        </select>
      </div>

      {/* No product-picker control in the filter bar above — this only ever gets set by
          arriving via a "View Detail" link (ShrinkageSummary.jsx), never typed in here
          directly, so a removable chip is enough rather than a full searchable dropdown. */}
      {productFilter && (
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
            {t("stockAdjustments.filteredByProduct")}:{" "}
            {adjustments?.find((row) => String(row.product_id) === String(productFilter))?.productname ||
              `#${productFilter}`}
            <button
              type="button"
              onClick={() => setProductFilter("")}
              className="rounded-full p-0.5 hover:bg-primary-100 dark:hover:bg-primary-500/20"
            >
              <HiOutlineXMark />
            </button>
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
        <div className="overflow-x-auto">
          {/* table-fixed + explicit %-widths (matching pages/Inventory/index.jsx's own
              table) — without it, columns auto-size by content and the long formatted
              date/time squeezed Product down to wrapping across two lines while leaving
              dead space after the last column (confirmed live: this was the reported bug). */}
          <table className="w-full min-w-[760px] table-fixed border-collapse">
            <thead className="bg-surface-subtle dark:bg-gray-800">
              <tr>
                <th className="w-8"></th>
                <th className="w-[19%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("stockAdjustments.date")}
                </th>
                <th className="w-[27%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("inventory.product")}
                </th>
                <th className="w-[14%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("stockAdjustments.quantityChange")}
                </th>
                <th className="w-[20%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("inventory.adjustStockReason")}
                </th>
                <th className="w-[18%] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t("stockAdjustments.adjustedBy")}
                </th>
              </tr>
            </thead>
            {adjustments === null ? (
              <tbody>
                <tr>
                  <td colSpan={6}>
                    <SkeletonRows count={5} />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-surface-border dark:divide-gray-800">
                {adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4">
                      <EmptyState icon={HiOutlineArchiveBoxXMark} title={t("stockAdjustments.empty")} />
                    </td>
                  </tr>
                ) : (
                  adjustments.map((row) => {
                    const isExpanded = expandedId === row.id;
                    const hasDetail = row.note || row.lot_code;
                    return (
                      <React.Fragment key={row.id}>
                        <tr className="transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60">
                          <td className="pl-3">
                            {hasDetail && (
                              <button
                                type="button"
                                onClick={() => setExpandedId(isExpanded ? null : row.id)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
                              >
                                {isExpanded ? <HiOutlineChevronDown /> : <HiOutlineChevronRight />}
                              </button>
                            )}
                          </td>
                          {/* No whitespace-nowrap here — with table-fixed's narrow, fixed-
                              width columns, nowrap text that doesn't fit overflows visibly
                              into the next cell instead of being clipped (confirmed live:
                              this is what caused the date to overlap a long product name).
                              Wrapping onto two lines here is the safe default. */}
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-300">
                            {formatDateTime(row.adjusted_at, { dateStyle: "medium", timeStyle: "short" })}
                          </td>
                          <td className="px-2 py-3 font-medium text-gray-800 dark:text-gray-100">
                            {row.productname}
                          </td>
                          <td
                            className={`px-2 py-3 font-semibold ${
                              row.quantity_change < 0
                                ? "text-danger-600 dark:text-danger-400"
                                : "text-success-600 dark:text-success-500"
                            }`}
                          >
                            {row.quantity_change > 0 ? `+${row.quantity_change}` : row.quantity_change}
                          </td>
                          <td className="px-2 py-3 text-gray-700 dark:text-gray-300">
                            {t(REASON_LABEL_KEY[row.reason_code] || row.reason_code)}
                          </td>
                          <td className="px-2 py-3 text-gray-600 dark:text-gray-300">
                            {row.adjusted_by_name || "—"}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="bg-surface-subtle px-5 py-4 dark:bg-gray-900">
                              <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
                                {row.note && (
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                      {t("stockAdjustments.note")}
                                    </p>
                                    <p className="text-sm text-gray-700 dark:text-gray-300">{row.note}</p>
                                  </div>
                                )}
                                {row.lot_code && (
                                  <>
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("inventory.lotCode")}
                                      </p>
                                      <p className="text-sm text-gray-700 dark:text-gray-300">{row.lot_code}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {t("stockAdjustments.traceability")}
                                      </p>
                                      <p className="text-sm text-gray-700 dark:text-gray-300">
                                        {t("inventory.vendor")}: {row.lot_vendor_name || "—"}
                                        <br />
                                        {t("stockAdjustments.lotReceivedAt")}:{" "}
                                        {row.lot_received_at
                                          ? formatDateTime(row.lot_received_at, { dateStyle: "medium" })
                                          : "—"}
                                        <br />
                                        {t("stockAdjustments.lotReceivedBy")}: {row.lot_received_by_name || "—"}
                                      </p>
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            )}
          </table>
        </div>
        {totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border px-4 py-3 dark:border-gray-800">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {totalCount.toLocaleString()} adjustment{totalCount === 1 ? "" : "s"} · Page {page} of {totalPages}
            </span>
            {totalPages > 1 && (
              <Pagination page={page} totalPages={totalPages} onPageChange={fetchAdjustments} />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
