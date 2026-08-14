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
  PieChart,
  Pie,
} from "recharts";

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
const TOOLTIP_LABEL_STYLE = { color: "#f3f4f6", fontWeight: 600, marginBottom: 4 };
// Same problem for the item value line (e.g. "Profit : 29700"): recharts colors it from
// the series' resolved stroke/fill, but the Bar here only sets fill per-point via <Cell>,
// not on <Bar> itself, so recharts has nothing to resolve and falls back to its own
// default — plain black, same unreadable-on-dark issue as the label.
const TOOLTIP_ITEM_STYLE = { color: "#f3f4f6" };

const PIE_COLORS = ["#4f46e5", "#0ea5e9", "#16a34a", "#f59e0b", "#e11d48", "#8b5cf6", "#14b8a6"];

// Recharts animates every chart open on mount (an arc/line/bar sweeping in over ~1.5s).
// Printing (both the print preview pane and the final render) re-measures this page's
// width — .print-area switches to position:absolute/width:100% under @media print — which
// makes ResponsiveContainer's ResizeObserver fire and remount the chart, restarting that
// animation. Whatever moment the browser happens to rasterize the page for print/PDF then
// catches the animation at a random, unfinished point — a pie chart frozen mid-sweep looks
// like a slice is missing, and it comes out different on every print. Disabling animation
// makes every chart render instantly and identically, print or screen, every time.
const NO_ANIMATION = { isAnimationActive: false };

const formatDay = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

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
  <div className="rounded-2xl border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-800 dark:bg-gray-900">
    <h3 className="mb-4 font-poppins text-base font-bold text-gray-800 dark:text-gray-100">
      {title}
    </h3>
    {children}
  </div>
);

// Advanced view for the Sales Report: revenue/profit trend over time, top products
// by profit contribution, and revenue share by category — all derived from the same
// salesData/timeSeriesData the plain table already uses, no extra round-trips.
export default function SalesCharts({ salesData, timeSeriesData }) {
  const hasTrend = timeSeriesData && timeSeriesData.length > 0;
  const hasSales = salesData && salesData.length > 0;

  const topProducts = hasSales
    ? [...salesData]
        .sort((a, b) => Number(b.overall_profit_loss) - Number(a.overall_profit_loss))
        .slice(0, 8)
        .map((item) => ({
          name: item.productname,
          profit: Number(item.overall_profit_loss),
        }))
    : [];

  const categoryShare = hasSales
    ? Object.values(
        salesData.reduce((acc, item) => {
          const key = item.category_name || "Uncategorized";
          const revenue = Number(item.total_quantity_sold) * Number(item.avg_selling_price);
          if (!acc[key]) acc[key] = { name: key, revenue: 0 };
          acc[key].revenue += revenue;
          return acc;
        }, {})
      )
    : [];

  if (!hasTrend && !hasSales) return null;

  return (
    <div className="mb-6 flex flex-col gap-4">
      {hasTrend && (
        <ChartCard title="Revenue & Profit Trend">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={timeSeriesData} margin={{ left: 0, right: 12 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="day" tickFormatter={formatDay} stroke={AXIS_COLOR} fontSize={12} />
              <YAxis stroke={AXIS_COLOR} fontSize={12} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} labelFormatter={formatDay} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#4f46e5" strokeWidth={2} dot={false} {...NO_ANIMATION} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="#16a34a" strokeWidth={2} dot={false} {...NO_ANIMATION} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
        {topProducts.length > 0 && (
          <ChartCard title="Top Products by Profit">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" stroke={AXIS_COLOR} fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  stroke={AXIS_COLOR}
                  fontSize={12}
                  tick={{ fill: AXIS_COLOR }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                />
                <Bar dataKey="profit" name="Profit" radius={[0, 4, 4, 0]} {...NO_ANIMATION}>
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

        {categoryShare.length > 0 && (
          <ChartCard title="Revenue Share by Category">
            {/* Custom legend below, not recharts' built-in <Legend> — that shares the
                ResponsiveContainer's height budget with the pie itself, and on this card's
                fixed height it was shrinking the circle's usable radius unevenly and
                clipping it into a half-moon. A plain HTML legend keeps the full height
                free for the pie. */}
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                />
                <Pie data={categoryShare} dataKey="revenue" nameKey="name" outerRadius={90} {...NO_ANIMATION}>
                  {categoryShare.map((entry, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {categoryShare.map((entry, index) => (
                <span key={entry.name} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                  <ColorDot color={PIE_COLORS[index % PIE_COLORS.length]} />
                  {entry.name}
                </span>
              ))}
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  );
}
