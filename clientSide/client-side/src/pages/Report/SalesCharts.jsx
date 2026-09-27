import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTimezone } from "timezone/TimezoneContext";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { formatPKR } from "utils/money";

const GRID_COLOR = "#9ca3af33";
const AXIS_COLOR = "#9ca3af";
const TOOLTIP_STYLE = {
  backgroundColor: "#1f2937",
  border: "none",
  borderRadius: 8,
  color: "#f3f4f6",
  fontSize: 12,
};
// Recharts' default tooltip label (the bold heading line, e.g. a product/day name) isn't
// styled by contentStyle — it defaults to plain black text with no color override, which
// is unreadable against TOOLTIP_STYLE's dark background in both light and dark app theme
// (the tooltip itself is always dark, regardless of theme). Set explicitly rather than
// relying on inheritance.
const TOOLTIP_LABEL_STYLE = {
  color: "#f3f4f6",
  fontWeight: 600,
  marginBottom: 4,
};
// Same problem for the item value line (e.g. "Profit : 29700"): recharts colors it from
// the series' resolved stroke/fill, but the Bar here only sets fill per-point via <Cell>,
// not on <Bar> itself, so recharts has nothing to resolve and falls back to its own
// default — plain black, same unreadable-on-dark issue as the label.
const TOOLTIP_ITEM_STYLE = { color: "#f3f4f6" };

// Revenue is indigo everywhere on this page (the trend line and both "when" charts), so the
// same colour always means the same measure.
const REVENUE_COLOR = "#4f46e5";

// SVG, not a CSS background-color swatch — browsers only print background colors when
// "print background graphics" is on (often off by default), so a plain
// <span style={{backgroundColor}}/> silently vanishes in a printed/PDF report while the
// chart's own SVG-filled shapes (and recharts' built-in <Legend>, which is also SVG) print
// fine. This is what was making the pie/bar legends unreadable on paper.
const ColorDot = ({ color }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
    <circle cx="5" cy="5" r="5" fill={color} />
  </svg>
);

const ChartCard = ({ title, children }) => (
  <div className="print-avoid-break rounded-2xl border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
    <h3 className="mb-4 font-poppins text-base font-bold text-gray-800 dark:text-gray-100">{title}</h3>
    {children}
  </div>
);

// Charts for the Sales Report: revenue/profit trend, top products by profit, and when sales
// happen (by hour of day and by day of week, in the shop's own timezone). Revenue share by
// category is a table with share bars in ReportBreakdowns instead of a pie — with a dozen+
// categories a pie's slices are unreadable and its colours had to repeat.
//
// Keeps recharts' entrance animation (an arc/line/bar sweeping in over ~1.5s on mount) —
// but exposes waitForAnimations() via ref for Report.jsx's Print button, because printing
// *while* a chart is mid-animation can capture it in an unfinished state (most visibly a
// pie chart frozen mid-sweep, looking like a slice is missing, different every time
// depending on exactly when the print snapshot lands). waitForAnimations() forces every
// chart to remount — via remountKey, rather than hoping the print layout's width change
// happens to trigger one on its own — and resolves only once each chart's onAnimationEnd
// has actually fired, so print always waits for the real, current animation to finish
// instead of a guessed delay.
// Axis ticks as "21M" / "450K" — full rupee amounts are too wide for the axis gutter and
// get clipped; the exact figure is in the tooltip.
const compactAmount = (value) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const hourLabel = (hour) => `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;

const SalesCharts = forwardRef(function SalesCharts(
  { timeSeriesData, topProducts = [], byHour = [], byWeekday = [], weekdayLabel },
  ref,
) {
  const { formatDateTime } = useTimezone();
  const [remountKey, setRemountKey] = useState(0);
  const pendingRef = useRef(new Set());
  const resolveRef = useRef(null);

  // The "day" values themselves are already grouped in the business timezone server-side
  // (see fetchSalesTimeSeries in salesService.js) — this just needs to display them in that
  // same timezone rather than the viewer's own, so the axis label always agrees with which
  // bucket a given point actually landed in.
  const formatDay = (iso) => formatDateTime(iso, { month: "short", day: "numeric" });

  const hasTrend = timeSeriesData && timeSeriesData.length > 0;
  const hasWhen = byHour.some((h) => h.revenue !== 0);
  const hourData = byHour.map((h) => ({ ...h, label: hourLabel(h.hour) }));
  const weekdayData = byWeekday.map((d) => ({
    ...d,
    label: weekdayLabel ? weekdayLabel(d.weekday) : String(d.weekday),
  }));
  const whenTooltip = {
    contentStyle: TOOLTIP_STYLE,
    labelStyle: TOOLTIP_LABEL_STYLE,
    itemStyle: TOOLTIP_ITEM_STYLE,
    formatter: (value) => [formatPKR(value), "Revenue"],
    labelFormatter: (label, payload) => {
      const transactions = payload?.[0]?.payload?.transactions;
      return transactions !== undefined ? `${label} · ${transactions} sales` : label;
    },
  };

  // Every series recharts will animate on the next remount — used to know exactly what
  // waitForAnimations() needs to wait for.
  const animatedKeys = useMemo(() => {
    const keys = [];
    if (hasTrend) keys.push("line-revenue", "line-profit");
    if (topProducts.length > 0) keys.push("bar");
    if (hasWhen) keys.push("bar-weekday", "bar-hour");
    return keys;
  }, [hasTrend, topProducts.length, hasWhen]);

  const markDone = (key) => () => {
    pendingRef.current.delete(key);
    if (pendingRef.current.size === 0 && resolveRef.current) {
      resolveRef.current();
      resolveRef.current = null;
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      waitForAnimations: () =>
        new Promise((resolve) => {
          if (animatedKeys.length === 0) {
            resolve();
            return;
          }
          pendingRef.current = new Set(animatedKeys);
          resolveRef.current = resolve;
          // Force a fresh remount so there's always a real, current animation to wait for,
          // instead of depending on whether the print layout's width change happens to
          // trigger one on its own.
          setRemountKey((k) => k + 1);
          // Safety net — recharts should always fire onAnimationEnd, but a missed event
          // must never hang the Print button forever.
          setTimeout(() => {
            if (resolveRef.current === resolve) {
              resolveRef.current = null;
              resolve();
            }
          }, 4000);
        }),
    }),
    [animatedKeys],
  );

  if (!hasTrend && topProducts.length === 0 && !hasWhen) return null;

  return (
    <div className="mb-6 flex flex-col gap-4">
      {hasTrend && (
        <ChartCard title="Revenue & Profit Trend">
          <ResponsiveContainer key={remountKey} width="100%" height={260}>
            <LineChart data={timeSeriesData} margin={{ left: 0, right: 12 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="day" tickFormatter={formatDay} stroke={AXIS_COLOR} fontSize={12} />
              <YAxis stroke={AXIS_COLOR} fontSize={12} tickFormatter={compactAmount} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} labelFormatter={formatDay} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke={REVENUE_COLOR}
                strokeWidth={2}
                dot={false}
                onAnimationEnd={markDone("line-revenue")}
              />
              <Line
                type="monotone"
                dataKey="profit"
                name="Profit"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
                onAnimationEnd={markDone("line-profit")}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
        {topProducts.length > 0 && (
          <ChartCard title="Top Products by Profit">
            <ResponsiveContainer key={remountKey} width="100%" height={280}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" stroke={AXIS_COLOR} fontSize={12} tickFormatter={compactAmount} />
                <YAxis type="category" dataKey="name" width={100} stroke={AXIS_COLOR} fontSize={12} tick={{ fill: AXIS_COLOR }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                <Bar dataKey="profit" name="Profit" radius={[0, 4, 4, 0]} onAnimationEnd={markDone("bar")}>
                  {topProducts.map((entry, index) => (
                    <Cell key={index} fill={entry.profit >= 0 ? "#16a34a" : "#dc2626"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <ColorDot color="#16a34a" />
                Profit
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <ColorDot color="#dc2626" />
                Loss
              </span>
            </div>
          </ChartCard>
        )}

        {hasWhen && (
          <ChartCard title="Sales by Day of Week">
            <ResponsiveContainer key={remountKey} width="100%" height={280}>
              <BarChart data={weekdayData} margin={{ left: 0, right: 12 }}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="label" stroke={AXIS_COLOR} fontSize={12} />
                <YAxis stroke={AXIS_COLOR} fontSize={12} tickFormatter={compactAmount} />
                <Tooltip {...whenTooltip} cursor={{ fill: GRID_COLOR }} />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill={REVENUE_COLOR}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  onAnimationEnd={markDone("bar-weekday")}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {hasWhen && (
        <ChartCard title="Sales by Hour of Day">
          <ResponsiveContainer key={remountKey} width="100%" height={240}>
            <BarChart data={hourData} margin={{ left: 0, right: 12 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" stroke={AXIS_COLOR} fontSize={11} interval="preserveStartEnd" />
              <YAxis stroke={AXIS_COLOR} fontSize={12} tickFormatter={compactAmount} />
              <Tooltip {...whenTooltip} cursor={{ fill: GRID_COLOR }} />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill={REVENUE_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                onAnimationEnd={markDone("bar-hour")}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
});

export default SalesCharts;
