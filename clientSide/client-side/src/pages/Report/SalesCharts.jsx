import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { useLanguage } from "i18n/LanguageContext";
import { formatPKR } from "utils/money";
import ReportCard, { chipClass } from "./ReportCard";

const GRID_COLOR = "#9ca3af33";
const AXIS_COLOR = "#9ca3af";
// Net sales is indigo on every chart here, profit green — the same colour always means the
// same measure.
const NET_SALES_COLOR = "#4f46e5";
const PROFIT_COLOR = "#16a34a";
// Every weekday shows up at least once from a week's range on — below that the weekday chart
// is just the trend chart again with its days reordered. (00:00 Monday to 23:59 Sunday is
// 6.999 days, hence the rounding where it's used.)
const MIN_DAYS_FOR_WEEKDAYS = 7;

// Axis ticks as "21M" / "450K" — full rupee amounts are too wide for the axis gutter; the
// exact figure is in the tooltip.
const compactAmount = (value) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const hourLabel = (hour) => `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`;

// SVG, not a CSS background-color swatch — backgrounds only print when the browser's
// "background graphics" option is on.
const ColorDot = ({ color }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
    <circle cx="5" cy="5" r="5" fill={color} />
  </svg>
);

const ChartTooltip = ({ active, payload, label, salesLabel }) => {
  if (!active || !payload?.length) return null;
  const { transactions } = payload[0].payload;
  return (
    <div className="rounded-lg bg-gray-800 px-3 py-2 text-xs text-white-A700 shadow-lg">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="flex items-center gap-2">
          <ColorDot color={item.color} />
          {item.name}: <span className="font-semibold">{formatPKR(item.value)}</span>
        </p>
      ))}
      {transactions !== undefined && (
        <p className="mt-1 text-gray-300">
          {transactions.toLocaleString("en-US")} {salesLabel}
        </p>
      )}
    </div>
  );
};

const axisProps = { stroke: AXIS_COLOR, fontSize: 12, tickLine: false };
const legendText = (value) => <span className="text-gray-600 dark:text-gray-300">{value}</span>;

// Revenue for one slot of time (an hour of the day, a weekday) — the shape both "busiest"
// charts share.
const SlotChart = ({ data, name, salesLabel, height }) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} margin={{ top: 8, left: 0, right: 12 }}>
      <CartesianGrid stroke={GRID_COLOR} vertical={false} />
      <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
      <YAxis {...axisProps} axisLine={false} width={52} tickFormatter={compactAmount} />
      <Tooltip content={<ChartTooltip salesLabel={salesLabel} />} cursor={{ fill: GRID_COLOR }} />
      <Bar dataKey="revenue" name={name} fill={NET_SALES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
    </BarChart>
  </ResponsiveContainer>
);

// When the money came in, one view at a time (same tabs as the category/cashier breakdown):
// net sales and profit over the period, the busiest hours of the day, and the busiest
// weekdays. A view only appears when the range can actually show it — a single day has no
// trend, a few days have no weekday pattern. On paper every view prints, one under another.
//
// Charts draw without animation: nothing to wait for before printing, and less work on a
// slow machine.
export default function SalesCharts({ trend, byHour, byWeekday, spanDays, view, onViewChange, printing }) {
  const { t, language } = useLanguage();
  const locale = language === "ur" ? "ur-PK" : "en-US";
  if (!trend || !byHour) return <div className="mb-6 h-80 animate-pulse rounded-2xl bg-surface-muted dark:bg-gray-800" />;

  const salesLabel = t("report.transactions").toLowerCase();
  // "YYYY-MM-DD" is already the shop's own calendar day — formatted in UTC so the viewer's
  // timezone can't move it to the day before.
  const dateFormat = trend.unit === "month" ? { month: "short", year: "numeric" } : { month: "short", day: "numeric" };
  const trendData = trend.rows.map((row) => ({
    ...row,
    label: new Date(`${row.day}T00:00:00Z`).toLocaleDateString(locale, { ...dateFormat, timeZone: "UTC" }),
  }));
  // Only the hours the shop actually trades — 24 bars with most of them empty just shrinks the ones that matter.
  const activeHours = byHour.filter((h) => h.transactions > 0).map((h) => h.hour);
  const hourData = byHour
    .filter((h) => h.hour >= Math.min(...activeHours) && h.hour <= Math.max(...activeHours))
    .map((h) => ({ ...h, label: hourLabel(h.hour) }));
  const weekdayData = byWeekday.map((d) => ({
    ...d,
    // 2024-01-01 was a Monday, ISO weekday 1.
    label: new Date(Date.UTC(2024, 0, d.weekday)).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }),
  }));

  // Shorter on paper, so the charts share pages instead of taking one each.
  const slotHeight = printing ? 170 : 260;
  const views = [
    trendData.length > 1 && {
      key: "trend",
      label: t("report.trendTab"),
      title: t("report.salesTrend"),
      hint: t(`report.trendHint_${trend.unit}`),
      chart: (
        <ResponsiveContainer width="100%" height={printing ? 200 : 300}>
          <ComposedChart data={trendData} margin={{ top: 8, left: 0, right: 12 }}>
            <CartesianGrid stroke={GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={16} />
            <YAxis {...axisProps} axisLine={false} width={52} tickFormatter={compactAmount} />
            <ReferenceLine y={0} stroke={AXIS_COLOR} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: GRID_COLOR }} />
            <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
            <Bar
              dataKey="revenue"
              name={t("report.netSales")}
              fill={NET_SALES_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
              isAnimationActive={false}
            />
            <Line
              dataKey="profit"
              name={t("report.profit")}
              stroke={PROFIT_COLOR}
              strokeWidth={2}
              dot={trendData.length <= 31 ? { r: 3, fill: PROFIT_COLOR } : false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ),
    },
    hourData.length > 0 && {
      key: "hours",
      label: t("report.hoursTab"),
      title: t("report.busiestHours"),
      hint: t("report.busiestHoursHint"),
      chart: <SlotChart data={hourData} name={t("report.netSales")} salesLabel={salesLabel} height={slotHeight} />,
    },
    Math.round(spanDays) >= MIN_DAYS_FOR_WEEKDAYS &&
      hourData.length > 0 && {
        key: "days",
        label: t("report.daysTab"),
        title: t("report.busiestDays"),
        hint: t("report.busiestDaysHint"),
        chart: <SlotChart data={weekdayData} name={t("report.netSales")} salesLabel={salesLabel} height={slotHeight} />,
      },
  ].filter(Boolean);
  if (views.length === 0) return null;
  const current = views.find((v) => v.key === view) || views[0];

  return (
    <ReportCard
      title={current.title}
      avoidBreak={false}
      actions={
        views.length > 1 && (
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
        )
      }
    >
      {/* The views not picked on screen are only built for the printout, not kept hidden on screen. */}
      {views
        .filter((v) => v === current || printing)
        .map((v) => (
          <div key={v.key} className="print-avoid-break px-3 pb-4 printing:px-0">
            {v !== current && <h4 className="px-2 pt-4 font-poppins text-base font-bold text-gray-800">{v.title}</h4>}
            <p className="px-2 pb-3 pt-3 text-xs text-gray-500 dark:text-gray-400">{v.hint}</p>
            {v.chart}
          </div>
        ))}
    </ReportCard>
  );
}
