import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "i18n/LanguageContext";
import { InfoTooltip } from "components";
import { formatPKR } from "utils/money";
import ReportCard from "./ReportCard";
import { reportGet } from "./reportApi";

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
// which this component's fetch-and-render shape mirrors. Laid out as one narrow column (it
// sits beside the sales breakdown on the report).
export default function ShrinkageSummary({ startDate, endDate, className }) {
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
    reportGet(`/api/stock-adjustments/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((error) => console.error("Error fetching shrinkage summary:", error));
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  const title = (
    <>
      {t("report.shrinkageTitle")}
      <InfoTooltip text={t("report.shrinkageTooltip")} />
    </>
  );

  if (!summary) {
    return <div className={`h-80 animate-pulse rounded-2xl bg-surface-muted dark:bg-gray-800 ${className}`} />;
  }

  // A plain render helper, not a component — defined in here, a component would remount every render.
  const detailList = ({ heading, rows, label, detailParams }) => (
    <div className="px-5 py-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{heading}</p>
      <ul className="space-y-2 text-sm">
        {rows.map((row) => (
          <li key={label(row)} className="flex items-center justify-between gap-2 text-gray-700 dark:text-gray-300">
            <span className="min-w-0">
              <span className="block truncate">{label(row)}</span>
              <button
                type="button"
                onClick={() => viewDetail(detailParams(row))}
                className="screen-only text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
              >
                {t("report.viewDetail")}
              </button>
            </span>
            <span className="shrink-0 whitespace-nowrap text-right">
              <span className="block font-semibold text-danger-600 dark:text-danger-400">{formatPKR(row.cost_impact)}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                {row.units_lost} {t("report.shrinkageUnitsLost").toLowerCase()}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <ReportCard title={title} className={className}>
      {summary.totalUnitsLost === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{t("report.shrinkageEmpty")}</p>
      ) : (
        <div className="divide-y divide-surface-border dark:divide-gray-800">
          <div className="grid grid-cols-2 gap-4 px-5 py-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("report.shrinkageCostImpact")}</p>
              <p className="font-poppins text-xl font-bold text-danger-600 dark:text-danger-400">{formatPKR(summary.totalCostImpact)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("report.shrinkageUnitsLost")}</p>
              <p className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">
                {Number(summary.totalUnitsLost).toLocaleString("en-US")}
              </p>
            </div>
          </div>
          {detailList({
            heading: t("report.shrinkageByReason"),
            rows: summary.byReason,
            label: (row) => t(REASON_LABEL_KEY[row.reason_code] || row.reason_code),
            detailParams: (row) => ({ reasonCode: row.reason_code }),
          })}
          {detailList({
            heading: t("report.shrinkageByProduct"),
            rows: summary.byProduct.slice(0, 5),
            label: (row) => row.productname,
            detailParams: (row) => ({ productId: row.product_id }),
          })}
        </div>
      )}
    </ReportCard>
  );
}
