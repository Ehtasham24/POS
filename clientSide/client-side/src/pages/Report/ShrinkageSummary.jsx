import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet } from "utils/api";

const REASON_LABEL_KEY = {
  damaged: "inventory.adjustStockReasonDamaged",
  expired: "inventory.adjustStockReasonExpired",
  theft: "inventory.adjustStockReasonTheft",
  count_correction: "inventory.adjustStockReasonCountCorrection",
  other: "inventory.adjustStockReasonOther",
};

// Total units and cost impact of shrinkage (Sevices/stockAdjustmentService.js's
// getShrinkageSummary) for the selected date range — the piece that finally puts stock
// adjustments' cost somewhere visible on the Sales Report, next to PaymentMediumSummary
// which this component's fetch-and-render shape mirrors.
export default function ShrinkageSummary({ startDate, endDate }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);

  // Same date range already selected on this report — carried over so "View Detail" lands
  // on exactly the same window the shrinkage figure being clicked was computed from,
  // filtered down to just that one reason or product (Stock Adjustments page reads these
  // via useSearchParams). No schema change needed for this — reason_code/product_id were
  // already on every row returned by getShrinkageSummary (Sevices/stockAdjustmentService.js).
  const viewDetail = (extraParams) => {
    const params = new URLSearchParams({ startDate, endDate, ...extraParams });
    navigate(`/stock-adjustments?${params.toString()}`);
  };

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    apiGet(`/api/stock-adjustments/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((error) => console.error("Error fetching shrinkage summary:", error));
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  if (!summary) {
    return <div className="mb-6 h-24 animate-pulse rounded-2xl bg-surface-muted dark:bg-gray-800" />;
  }

  if (summary.totalUnitsLost === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-dashed border-surface-border bg-surface-subtle p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400">
        {t("report.shrinkageEmpty")}
      </div>
    );
  }

  return (
    <div className="print-avoid-break mb-6 rounded-2xl border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
      <p className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">{t("report.shrinkageTitle")}</p>
      <div className="mb-4 flex flex-wrap gap-6">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("report.shrinkageUnitsLost")}</p>
          <p className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">{summary.totalUnitsLost}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("report.shrinkageCostImpact")}</p>
          <p className="font-poppins text-xl font-bold text-danger-600 dark:text-danger-400">
            Rs.{Number(summary.totalCostImpact).toFixed(0)}
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("report.shrinkageByReason")}
          </p>
          <ul className="space-y-1 text-sm">
            {summary.byReason.map((row) => (
              <li key={row.reason_code} className="flex items-center justify-between gap-2 text-gray-700 dark:text-gray-300">
                <span className="truncate">{t(REASON_LABEL_KEY[row.reason_code] || row.reason_code)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-medium text-gray-800 dark:text-gray-100">
                    {row.units_lost} · Rs.{Number(row.cost_impact).toFixed(0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => viewDetail({ reasonCode: row.reason_code })}
                    className="whitespace-nowrap text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
                  >
                    {t("report.viewDetail")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("report.shrinkageByProduct")}
          </p>
          <ul className="space-y-1 text-sm">
            {summary.byProduct.slice(0, 5).map((row) => (
              <li key={row.product_id} className="flex items-center justify-between gap-2 text-gray-700 dark:text-gray-300">
                <span className="truncate">{row.productname}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-medium text-gray-800 dark:text-gray-100">
                    {row.units_lost} · Rs.{Number(row.cost_impact).toFixed(0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => viewDetail({ productId: row.product_id })}
                    className="whitespace-nowrap text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
                  >
                    {t("report.viewDetail")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
