import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlineArrowPath } from "react-icons/hi2";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { SkeletonRows } from "components";
import { useToast } from "components/Toast/ToastContext";
import { apiGet } from "utils/api";
import { formatPKR } from "utils/money";
import AdminPage from "./AdminPage";
import { Card, StatTile, SEVERITY_CLASS, TIER_CHIP_CLASS, formatBytes, buttonClass, cardClass } from "./shared";

const REFRESH_MS = 60 * 1000;
const BAR_COLOR = "#4f46e5";
const GRID_COLOR = "#9ca3af33";
const AXIS_COLOR = "#9ca3af";

const compact = (value) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const dayLabel = (day) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

const SalesTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg bg-gray-800 px-3 py-2 text-xs text-white-A700 shadow-lg">
      <p className="mb-1 font-semibold">{dayLabel(row.day)}</p>
      <p>{formatPKR(row.revenue)}</p>
      <p className="text-gray-300">{row.transactions.toLocaleString()} receipts</p>
    </div>
  );
};

// The admin console's landing page: the whole platform at a glance, and what needs the
// admin's attention today (Sevices/adminService.js's getPlatformOverview).
export default function AdminOverview() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      setData(await apiGet("/api/admin/overview"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shopLink = (shopId) => `/admin/shops?shop=${shopId}`;

  return (
    <AdminPage
      title="Overview"
      heading="Overview"
      subtitle="Every shop on the platform at a glance — refreshes every minute."
      actions={
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className={`${buttonClass.secondary} flex items-center gap-1.5`}
        >
          <HiOutlineArrowPath className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      }
    >
      {!data ? (
        <div className={cardClass}>
          <SkeletonRows count={6} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4 md:grid-cols-2 sm:grid-cols-1">
            <StatTile
              label="Sales today"
              value={formatPKR(data.sales.today.revenue)}
              note={`${data.sales.today.transactions.toLocaleString()} receipts, all shops`}
            />
            <StatTile
              label="Last 30 days"
              value={formatPKR(data.sales.last30Days.revenue)}
              note={`${data.sales.last30Days.transactions.toLocaleString()} receipts · 7 days: ${formatPKR(data.sales.last7Days.revenue)}`}
            />
            <StatTile
              label="Active shops"
              value={`${data.shops.active} / ${data.shops.total}`}
              note={`${data.shops.onlineNow} online now · ${data.shops.newLast30Days} new this month`}
            />
            <StatTile
              label="Database"
              value={formatBytes(data.database.sizeBytes)}
              note={`of ${formatBytes(data.database.capacityBytes)} (${
                data.database.capacityBytes ? Math.round((data.database.sizeBytes / data.database.capacityBytes) * 100) : 0
              }%)`}
            />
          </div>

          <Card title="Needs attention">
            {data.attention.length === 0 ? (
              <p className="flex items-center gap-2 px-5 py-4 text-sm text-success-600 dark:text-success-500">
                <HiOutlineCheckCircle className="text-lg" />
                All clear — nothing needs you right now.
              </p>
            ) : (
              <ul className="space-y-2 p-4">
                {data.attention.map((item, i) => (
                  <li
                    key={`${item.kind}-${item.shopId}-${i}`}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm ${SEVERITY_CLASS[item.severity]}`}
                  >
                    <HiOutlineExclamationTriangle className="shrink-0 text-base" />
                    {item.shopId ? (
                      <Link to={shopLink(item.shopId)} className="font-semibold underline-offset-2 hover:underline">
                        {item.shopName}
                      </Link>
                    ) : null}
                    <span>{item.message}</span>
                    {item.kind === "security" || item.kind === "errors" ? (
                      <Link to="/admin/health" className="ml-auto text-xs font-semibold underline-offset-2 hover:underline">
                        Open Health
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Net sales, all shops — last 30 days">
            <div className="px-3 pb-4 pt-4">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.sales.daily} margin={{ top: 4, left: 0, right: 12 }}>
                  <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={dayLabel}
                    stroke={AXIS_COLOR}
                    fontSize={12}
                    tickLine={false}
                    minTickGap={16}
                  />
                  <YAxis stroke={AXIS_COLOR} fontSize={12} tickLine={false} axisLine={false} width={52} tickFormatter={compact} />
                  <Tooltip content={<SalesTooltip />} cursor={{ fill: GRID_COLOR }} />
                  <Bar dataKey="revenue" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-1">
            <Card title="Top shops — last 30 days">
              {data.topShops.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">No sales in the last 30 days.</p>
              ) : (
                <ul className="divide-y divide-surface-border dark:divide-gray-700">
                  {data.topShops.map((shop) => {
                    const share = data.sales.last30Days.revenue ? (shop.revenue / data.sales.last30Days.revenue) * 100 : 0;
                    return (
                      <li key={shop.id} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <Link to={shopLink(shop.id)} className="font-medium text-gray-800 hover:underline dark:text-gray-100">
                            {shop.name}
                          </Link>
                          <span className="whitespace-nowrap font-semibold text-gray-800 dark:text-gray-100">
                            {formatPKR(shop.revenue)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted dark:bg-gray-700">
                            <div className="h-full rounded-full bg-primary-600" style={{ width: `${Math.min(share, 100)}%` }} />
                          </div>
                          <span className="w-10 text-right text-xs text-gray-500 dark:text-gray-400">{Math.round(share)}%</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Shops and users">
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.shops.byTier).map(([tier, count]) => (
                    <span
                      key={tier}
                      className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${TIER_CHIP_CLASS[tier]}`}
                    >
                      {tier}: {count}
                    </span>
                  ))}
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Owners</dt>
                    <dd className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">{data.users.owner || 0}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Cashiers</dt>
                    <dd className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">{data.users.cashier || 0}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Inactive shops</dt>
                    <dd className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                      {data.shops.total - data.shops.active}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Online now</dt>
                    <dd className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">{data.shops.onlineNow}</dd>
                  </div>
                </dl>
              </div>
            </Card>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
