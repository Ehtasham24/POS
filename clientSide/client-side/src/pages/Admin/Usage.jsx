import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { HiOutlineMagnifyingGlass, HiOutlineBuildingStorefront, HiOutlineArrowLeft } from "react-icons/hi2";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { EmptyState, SkeletonRows } from "components";
import { useToast } from "components/Toast/ToastContext";
import { apiGet } from "utils/api";
import AdminHeader from "./AdminHeader";
import {
  inputClass,
  TIER_CHIP_CLASS,
  USAGE_TABLE_LABEL,
  formatBytes,
  QUOTA_WARNING_PERCENT,
  quotaBarColorClass,
  quotaTextColorClass,
} from "./shared";

// Same fixed colors pages/Report/SalesCharts.jsx already established for this app's charts
// (rechecked against both themes there already).
const GRID_COLOR = "#9ca3af33";
const AXIS_COLOR = "#9ca3af";
const TOOLTIP_STYLE = { backgroundColor: "#1f2937", border: "none", borderRadius: 8, color: "#f3f4f6", fontSize: 12 };
const BAR_COLOR = "#4f46e5"; // primary-600 — one measure (bytes) across tables, not series
const PAGE_SIZE = 10;

function StatTile({ label, value, valueClassName }) {
  return (
    <div className="rounded-xl2 border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 font-poppins text-2xl font-bold ${valueClassName || "text-gray-800 dark:text-gray-100"}`}>
        {value}
      </p>
    </div>
  );
}

// A magnitude-vs-total (share of something), never a category comparison — one color per
// bar, never a categorical set, per the same reasoning as the breakdown chart's single hue.
function ShareBar({ label, note, percent, colorClass }) {
  return (
    <div className="rounded-xl2 border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-gray-800 dark:text-gray-100">{label}</span>
        <span className="text-gray-500 dark:text-gray-400">{note}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-surface-muted dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${Math.min(Math.max(percent, percent > 0 ? 1.5 : 0), 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function UsagePage() {
  const toast = useToast();
  const [usage, setUsage] = useState([]);
  const [totalDbCapacityBytes, setTotalDbCapacityBytes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet("/api/admin/usage");
        setUsage(data.shops);
        setTotalDbCapacityBytes(data.totalDbCapacityBytes);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ILIKE-equivalent (case-insensitive substring) done client-side — the full shop list is
  // already in hand from the one /api/admin/usage fetch above, so there's no reason to round
  // -trip to the server on every keystroke for what's realistically a handful to a few dozen
  // tenants.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return usage.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 8);
  }, [usage, query]);

  const grandTotalBytes = useMemo(() => usage.reduce((sum, u) => sum + u.approxBytes, 0), [usage]);
  const grandTotalRows = useMemo(() => usage.reduce((sum, u) => sum + u.totalRows, 0), [usage]);
  const selected = usage.find((u) => u.id === selectedId) || null;
  const sharePercent = selected && grandTotalBytes > 0 ? (selected.approxBytes / grandTotalBytes) * 100 : 0;
  const quotaPercent =
    selected?.storage_quota_bytes ? (selected.approxBytes / selected.storage_quota_bytes) * 100 : null;

  const chartData = useMemo(() => {
    if (!selected) return [];
    return Object.entries(selected.tables)
      .map(([table, stats]) => ({
        table: USAGE_TABLE_LABEL[table] || table,
        bytes: stats.approxBytes,
        rows: stats.rowCount,
      }))
      .filter((row) => row.bytes > 0 || row.rows > 0)
      .sort((a, b) => b.bytes - a.bytes);
  }, [selected]);

  const rankedUsage = useMemo(() => usage.slice().sort((a, b) => b.approxBytes - a.approxBytes), [usage]);
  const totalPages = Math.max(1, Math.ceil(rankedUsage.length / PAGE_SIZE));
  const pagedUsage = rankedUsage.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectShop = (u) => {
    setSelectedId(u.id);
    setQuery("");
  };
  const backToList = () => setSelectedId(null);

  return (
    <div className="min-h-screen bg-surface-subtle dark:bg-gray-900">
      <Helmet>
        <title>Usage · Platform Admin</title>
      </Helmet>

      <AdminHeader />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5">
          <h1 className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">Resource Usage</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            One shared database, no per-tenant infrastructure — usage here is measured
            directly from each shop's own row counts, actual row sizes, and real response
            bytes sent, never inferred.
          </p>
          {totalDbCapacityBytes != null && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Total DB capacity: <strong>{formatBytes(totalDbCapacityBytes)}</strong> — every
              shop's "Quota Used" below is relative to this. Change it from the Shops tab's
              Platform Settings button.
            </p>
          )}
        </div>

        {!selected ? (
          <>
            <div className="relative mb-6 max-w-md">
              <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a shop by name…"
                className={`${inputClass} pl-9`}
              />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-surface-border bg-white-A700 shadow-modal dark:border-gray-700 dark:bg-gray-800">
                  {matches.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => selectShop(u)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-subtle dark:hover:bg-gray-700"
                      >
                        <span className="flex items-center gap-2 text-gray-800 dark:text-gray-100">
                          <HiOutlineBuildingStorefront className="shrink-0 text-gray-400" />
                          {u.name}
                        </span>
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${TIER_CHIP_CLASS[u.tier]}`}>
                          {u.tier}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">All shops, ranked by usage</h2>
              {rankedUsage.length > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {rankedUsage.length} shop{rankedUsage.length === 1 ? "" : "s"} total
                </p>
              )}
            </div>

            <div className="overflow-hidden rounded-xl2 border border-surface-border bg-white-A700 shadow-card dark:border-gray-700 dark:bg-gray-800">
              {loading ? (
                <SkeletonRows count={4} />
              ) : rankedUsage.length === 0 ? (
                <EmptyState title="No usage data yet." />
              ) : (
                <>
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-surface-subtle dark:bg-gray-900/40">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Shop</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Tier</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Approx Size</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Share of DB</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Quota Used</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Egress (30d)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                      {pagedUsage.map((u) => {
                        const share = grandTotalBytes > 0 ? (u.approxBytes / grandTotalBytes) * 100 : 0;
                        const quotaPct = u.storage_quota_bytes ? (u.approxBytes / u.storage_quota_bytes) * 100 : null;
                        return (
                          <tr
                            key={u.id}
                            onClick={() => selectShop(u)}
                            className="cursor-pointer transition-colors hover:bg-surface-subtle dark:hover:bg-gray-700/40"
                          >
                            <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{u.name}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-md px-2 py-1 text-xs font-semibold capitalize ${TIER_CHIP_CLASS[u.tier]}`}>
                                {u.tier}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatBytes(u.approxBytes)}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{share.toFixed(1)}%</td>
                            <td className="px-4 py-3">
                              {quotaPct === null ? (
                                <span className="text-gray-400 dark:text-gray-500">No quota</span>
                              ) : (
                                <span className={`font-semibold ${quotaTextColorClass(quotaPct)}`}>{quotaPct.toFixed(1)}%</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatBytes(u.egressBytes)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-surface-border px-4 py-3 dark:border-gray-700">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        ← Previous
                      </button>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Page {page} of {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={backToList}
              className="flex items-center gap-1.5 text-sm font-medium text-primary-600 transition-colors hover:underline dark:text-primary-400"
            >
              <HiOutlineArrowLeft /> Back to Shops
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">{selected.name}</h2>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold capitalize ${TIER_CHIP_CLASS[selected.tier]}`}>
                {selected.tier}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 sm:grid-cols-1">
              <StatTile label="Total rows" value={selected.totalRows.toLocaleString()} />
              <StatTile label="Approx size" value={formatBytes(selected.approxBytes)} />
              <StatTile label="Egress (last 30 days)" value={formatBytes(selected.egressBytes)} />
            </div>

            <ShareBar
              label={`${selected.name}'s share of the total database`}
              note={`${formatBytes(selected.approxBytes)} of ${formatBytes(grandTotalBytes)} total · ${grandTotalRows.toLocaleString()} rows across ${usage.length} shop${usage.length === 1 ? "" : "s"}`}
              percent={sharePercent}
              colorClass="bg-primary-600"
            />

            {quotaPercent === null ? (
              <div className="rounded-xl2 border border-dashed border-surface-border bg-surface-subtle p-5 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400">
                No storage quota configured for this shop — set one from the Shops tab's Edit
                action to start tracking how close it is to a limit.
              </div>
            ) : (
              <ShareBar
                label={`${selected.name}'s own allotted quota`}
                note={`${formatBytes(selected.approxBytes)} of ${formatBytes(selected.storage_quota_bytes)} allotted (${quotaPercent.toFixed(1)}%)${
                  quotaPercent >= QUOTA_WARNING_PERCENT ? " — the shop is currently seeing the warning icon" : ""
                }`}
                percent={quotaPercent}
                colorClass={quotaBarColorClass(quotaPercent)}
              />
            )}

            <div className="rounded-xl2 border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
              <p className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100">Egress — computation / data-transfer load</p>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                Real response bytes this shop's users have actually downloaded, summed over
                the last 30 days — a proxy for how much of the database's serving capacity
                this shop is occupying, not just how much of it is stored.
              </p>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total transferred</p>
                  <p className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                    {formatBytes(selected.egressBytes)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Requests served</p>
                  <p className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                    {selected.egressRequests.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl2 border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
              <p className="mb-4 text-sm font-semibold text-gray-800 dark:text-gray-100">Breakdown by table</p>
              {chartData.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No data recorded for this shop yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(chartData.length * 34, 100)}>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                    <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => formatBytes(v)} stroke={AXIS_COLOR} fontSize={12} />
                    <YAxis type="category" dataKey="table" width={116} stroke={AXIS_COLOR} fontSize={12} />
                    <Tooltip
                      cursor={{ fill: "#9ca3af1a" }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value, _name, props) => [
                        `${formatBytes(value)} · ${props.payload.rows.toLocaleString()} row${props.payload.rows === 1 ? "" : "s"}`,
                        "Size",
                      ]}
                    />
                    <Bar dataKey="bytes" fill={BAR_COLOR} radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
