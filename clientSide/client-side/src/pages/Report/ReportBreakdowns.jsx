import { useLanguage } from "i18n/LanguageContext";
import { formatPKR } from "utils/money";
import ReportCard, { chipClass } from "./ReportCard";

const marginOf = (profit, revenue) => (revenue ? Math.round((profit / revenue) * 1000) / 10 : null);

const th = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";
const td = "px-4 py-2.5 text-sm text-gray-800 dark:text-gray-100";
// Amounts never wrap mid-number ("PKR" on one line, the digits on the next).
const money = "whitespace-nowrap text-right";

const ProfitCell = ({ profit, revenue }) => {
  const margin = marginOf(profit, revenue);
  return (
    <td className={`${td} ${money}`}>
      <span className={profit < 0 ? "font-semibold text-danger-600" : "font-semibold"}>{formatPKR(profit)}</span>
      {margin !== null && <span className="block text-xs text-gray-500 dark:text-gray-400">{margin}%</span>}
    </td>
  );
};

const Empty = ({ text }) => <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{text}</p>;

const CategoryTable = ({ rows, shareBase, t }) => (
  <table className="w-full min-w-[30rem] table-auto">
    <thead>
      <tr>
        <th className={th}>{t("report.category")}</th>
        <th className={`${th} w-1/3`}>{t("report.share")}</th>
        <th className={`${th} text-right`}>{t("report.netSales")}</th>
        <th className={`${th} text-right`}>{t("report.profit")}</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-surface-border dark:divide-gray-800">
      {rows.map((row) => {
        const share = shareBase > 0 ? Math.max(0, (row.revenue / shareBase) * 100) : 0;
        return (
          <tr key={row.category_id ?? "none"}>
            <td className={td}>
              <span className="font-medium">{row.category_id ? row.category_name : t("report.unassigned")}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                {row.qty_sold.toLocaleString("en-US")} {t("report.sold").toLowerCase()}
              </span>
            </td>
            <td className={td}>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted dark:bg-gray-800">
                  <div className="h-full rounded-full bg-primary-600" style={{ width: `${Math.min(share, 100)}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
                  {share.toFixed(share < 10 ? 1 : 0)}%
                </span>
              </div>
            </td>
            <td className={`${td} ${money} font-semibold`}>{formatPKR(row.revenue)}</td>
            <ProfitCell profit={row.profit} revenue={row.revenue} />
          </tr>
        );
      })}
    </tbody>
  </table>
);

const CashierTable = ({ rows, t }) => (
  <table className="w-full min-w-[26rem] table-auto">
    <thead>
      <tr>
        <th className={th}>{t("report.cashier")}</th>
        <th className={`${th} text-right`}>{t("report.transactions")}</th>
        <th className={`${th} text-right`}>{t("report.netSales")}</th>
        <th className={`${th} text-right`}>{t("report.profit")}</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-surface-border dark:divide-gray-800">
      {rows.map((row) => (
        <tr key={row.user_id ?? "none"}>
          <td className={`${td} font-medium`}>{row.user_id ? row.name : t("report.unassigned")}</td>
          <td className={`${td} ${money}`}>
            {row.transactions.toLocaleString("en-US")}
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              {formatPKR(row.transactions ? row.revenue / row.transactions : 0)} {t("report.perReceipt")}
            </span>
          </td>
          <td className={`${td} ${money} font-semibold`}>{formatPKR(row.revenue)}</td>
          <ProfitCell profit={row.profit} revenue={row.revenue} />
        </tr>
      ))}
    </tbody>
  </table>
);

// Where the sales came from, one view at a time: each category's share of net sales (a table
// with share bars — clearer than a pie once there are more than a handful of categories), or
// each cashier's takings. Net sales = sales minus refunds, same as the headline tile.
// The printout has room for both, so the view not picked on screen still prints.
export default function ReportBreakdowns({ breakdowns, netSales, view, onViewChange, className }) {
  const { t } = useLanguage();
  if (!breakdowns) return <div className={`h-80 animate-pulse rounded-2xl bg-surface-muted dark:bg-gray-800 ${className}`} />;
  const { byCategory, byCashier } = breakdowns;
  const shareBase = netSales > 0 ? netSales : byCategory.reduce((sum, c) => sum + Math.max(c.revenue, 0), 0);

  const views = [
    {
      key: "category",
      label: t("report.category"),
      title: t("report.salesByCategory"),
      body: byCategory.length ? <CategoryTable rows={byCategory} shareBase={shareBase} t={t} /> : null,
    },
    {
      key: "cashier",
      label: t("report.cashier"),
      title: t("report.salesByCashier"),
      body: byCashier.length ? <CashierTable rows={byCashier} t={t} /> : null,
    },
  ];
  const current = views.find((v) => v.key === view) || views[0];

  return (
    <ReportCard
      title={current.title}
      className={className}
      actions={
        <div role="tablist" className="flex gap-2">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={v === current}
              onClick={() => onViewChange(v.key)}
              className={chipClass(v === current)}
            >
              {v.label}
            </button>
          ))}
        </div>
      }
    >
      {views.map((v) => (
        <div key={v.key} className={v === current ? "overflow-x-auto" : "print-only"}>
          {/* On paper the card's own title only names the view picked on screen. */}
          {v !== current && <h4 className="px-5 pb-1 pt-4 font-poppins text-base font-bold text-gray-800">{v.title}</h4>}
          {v.body || <Empty text={t("report.noSalesInPeriod")} />}
        </div>
      ))}
    </ReportCard>
  );
}
