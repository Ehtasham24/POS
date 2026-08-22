import { useEffect, useState } from "react";
import { HiOutlineBanknotes, HiOutlineCreditCard, HiOutlineQrCode } from "react-icons/hi2";
import { useLanguage } from "i18n/LanguageContext";
import { apiPost } from "utils/api";

const MEDIUM_META = {
  cash: {
    icon: HiOutlineBanknotes,
    labelKey: "payment.cash",
    classes: "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500",
  },
  card: {
    icon: HiOutlineCreditCard,
    labelKey: "payment.card",
    classes: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
  },
  bank_transfer: {
    icon: HiOutlineQrCode,
    labelKey: "payment.bankTransfer",
    classes: "bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400",
  },
};

// Reused by both the Sales Report page (its own selected date range) and the Payment
// Mediums page (an "all time" snapshot) — one fetch-and-render-3-cards component instead
// of duplicating it, since both need the exact same totals
// (Sevices/salesService.js's fetchPaymentMediumTotals). onMediumClick, when passed, makes
// each card a button (Payment Mediums links into Sales History, pre-filtered); the Report
// page omits it since it's already the report.
export default function PaymentMediumSummary({ startDate, endDate, onMediumClick }) {
  const { t } = useLanguage();
  const [totals, setTotals] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setTotals(null);
    apiPost("/api/Sales/payment-medium-totals", { startDate, endDate })
      .then((data) => {
        if (!cancelled) setTotals(data);
      })
      .catch((error) => console.error("Error fetching payment medium totals:", error));
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  if (!totals) {
    return (
      <div className="mb-6 grid grid-cols-3 gap-4 sm:grid-cols-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-muted dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 grid grid-cols-3 gap-4 sm:grid-cols-1">
      {Object.keys(MEDIUM_META).map((medium) => {
        const { icon: Icon, labelKey, classes } = MEDIUM_META[medium];
        const Wrapper = onMediumClick ? "button" : "div";
        return (
          <Wrapper
            key={medium}
            type={onMediumClick ? "button" : undefined}
            onClick={onMediumClick ? () => onMediumClick(medium) : undefined}
            className={`flex items-center gap-4 rounded-2xl border border-surface-border bg-white-A700 p-5 text-left shadow-card dark:border-gray-700 dark:bg-gray-800 ${
              onMediumClick ? "transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60" : ""
            }`}
          >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${classes}`}>
              <Icon className="text-xl" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t(labelKey)}</p>
              <p className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">
                Rs.{Number(totals[medium] || 0).toFixed(0)}
              </p>
            </div>
          </Wrapper>
        );
      })}
      {/* 'unknown' = sales from before sale_transactions existed (migrations/008) — real
          historical revenue with no recorded medium, shown only when it's actually
          nonzero rather than a permanent fourth card most shops will never see. */}
      {totals.unknown > 0 && (
        // col-span-3 on a grid whose explicit template drops to 1 column at sm: (this
        // project's `sm` is a max-width/mobile breakpoint, not min-width — see
        // tailwind.config.js) forces the grid to grow implicit columns to satisfy the
        // span, silently pulling every OTHER card back into that wider implicit grid
        // too. sm:col-span-1 keeps the span inside whatever the grid actually has.
        <div className="col-span-3 flex items-center gap-4 rounded-2xl border border-dashed border-surface-border bg-surface-subtle p-4 dark:border-gray-700 dark:bg-gray-800/40 sm:col-span-1">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("report.unrecordedMedium")}</p>
            <p className="font-poppins text-lg font-bold text-gray-600 dark:text-gray-300">
              Rs.{Number(totals.unknown).toFixed(0)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
