import { HiArrowTrendingUp, HiArrowTrendingDown, HiOutlineMinus } from "react-icons/hi2";
import { useLanguage } from "i18n/LanguageContext";
import { formatPKR } from "utils/money";

// polarity: "up" = higher is good, "down" = higher is bad (refunds, voids), "neutral" = no
// judgement either way (cost of goods rises with sales). Colour is never the only signal —
// every change also has an arrow and a signed percentage. Nothing is shown when the previous
// figure is zero: there's no percentage to give (an empty previous period is said once, above
// the tiles).
const Delta = ({ current, previous, polarity }) => {
  const { t } = useLanguage();
  if (!previous) return null;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(change * 10) / 10;
  const flat = rounded === 0;
  const wentUp = rounded > 0;
  const good = polarity === "neutral" || flat ? null : wentUp === (polarity === "up");
  const tone =
    good === null
      ? "text-gray-500 dark:text-gray-400"
      : good
        ? "text-success-600 dark:text-success-500"
        : "text-danger-600 dark:text-danger-500";
  const Icon = flat ? HiOutlineMinus : rounded > 0 ? HiArrowTrendingUp : HiArrowTrendingDown;
  return (
    <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${tone}`}>
      <Icon className="text-sm" />
      {rounded > 0 ? "+" : ""}
      {rounded}%<span className="font-normal text-gray-400 dark:text-gray-500 printing:hidden">{t("report.vsPrevious")}</span>
    </p>
  );
};

const Tile = ({ label, value, detail, current, previous, polarity = "up", emphasis }) => (
  <div className="print-avoid-break rounded-2xl border border-surface-border bg-white-A700 p-4 shadow-card dark:border-gray-800 dark:bg-gray-900 printing:rounded-lg printing:p-3 printing:shadow-none">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
    <p
      className={`mt-1 break-words font-poppins text-2xl font-bold md:text-xl sm:text-lg printing:text-base ${
        emphasis === "negative" ? "text-danger-600" : "text-gray-800 dark:text-gray-100"
      }`}
    >
      {value}
    </p>
    {detail && <p className="text-xs text-gray-500 dark:text-gray-400">{detail}</p>}
    <Delta current={current} previous={previous} polarity={polarity} />
  </div>
);

// The report's headline numbers, each against the equal-length period just before.
export default function ReportKpis({ summary }) {
  const { t } = useLanguage();
  if (!summary) {
    return (
      <div className="mb-6 grid grid-cols-4 gap-3 md:grid-cols-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-white-A700 dark:bg-gray-900" />
        ))}
      </div>
    );
  }
  const { current: c, previous: p } = summary;
  const previousHadActivity = p.transactions > 0 || p.refundCount > 0 || p.voidCount > 0;

  return (
    <>
      {!previousHadActivity && (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400 printing:hidden">{t("report.noPrevious")}</p>
      )}
      <div className="mb-6 grid grid-cols-4 gap-3 md:grid-cols-2 printing:mb-1 printing:grid-cols-4 printing:gap-2">
        <Tile
          label={t("report.netSales")}
          value={formatPKR(c.netSales)}
          detail={c.refunds > 0 ? t("report.grossDetail", { amount: formatPKR(c.grossSales) }) : null}
          current={c.netSales}
          previous={p.netSales}
        />
        <Tile
          label={t("report.grossProfit")}
          value={formatPKR(c.profit)}
          detail={c.marginPercent !== null ? t("report.marginOf", { n: c.marginPercent }) : null}
          current={c.profit}
          previous={p.profit}
          emphasis={c.profit < 0 ? "negative" : null}
        />
        <Tile
          label={t("report.transactions")}
          value={c.transactions.toLocaleString("en-US")}
          current={c.transactions}
          previous={p.transactions}
        />
        <Tile
          label={t("report.averageSale")}
          value={formatPKR(c.averageSale)}
          detail={t("report.perReceipt")}
          current={c.averageSale}
          previous={p.averageSale}
        />
        <Tile
          label={t("report.itemsSold")}
          value={c.itemsSold.toLocaleString("en-US")}
          detail={c.itemsRefunded ? t("report.itemsReturned", { n: c.itemsRefunded }) : null}
          current={c.itemsSold}
          previous={p.itemsSold}
        />
        <Tile
          label={t("report.refunds")}
          value={formatPKR(c.refunds)}
          detail={t("report.refundsDetail", {
            count: c.refundCount,
            items: c.itemsRefunded,
          })}
          current={c.refunds}
          previous={p.refunds}
          polarity="down"
        />
        <Tile label={t("report.costOfGoods")} value={formatPKR(c.cost)} current={c.cost} previous={p.cost} polarity="neutral" />
        <Tile
          label={t("report.voided")}
          value={formatPKR(c.voidValue)}
          detail={t("report.voidsDetail", { n: c.voidCount })}
          current={c.voidValue}
          previous={p.voidValue}
          polarity="down"
        />
      </div>
      {/* On paper the tiles are too narrow to repeat this under every percentage — said once instead. */}
      <p className="print-only mb-5 text-[10px] text-gray-500">{t("report.vsPreviousNote")}</p>
    </>
  );
}
