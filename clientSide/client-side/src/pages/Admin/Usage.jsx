import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineBuildingStorefront,
  HiOutlineArrowLeft,
  HiOutlinePlay,
  HiOutlineStop,
} from "react-icons/hi2";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
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
  ShareBar,
} from "./shared";

// Same fixed colors pages/Report/SalesCharts.jsx already established for this app's charts
// (rechecked against both themes there already).
const GRID_COLOR = "#9ca3af33";
const AXIS_COLOR = "#9ca3af";
const TOOLTIP_STYLE = { backgroundColor: "#1f2937", border: "none", borderRadius: 8, color: "#f3f4f6", fontSize: 12 };
const BAR_COLOR = "#4f46e5"; // primary-600 — one measure (bytes) across tables, not series
const PAGE_SIZE = 10;

// Live Monitor — off by default (an admin opts in, same reasoning StorageWarningBadge's
// "invisible until it matters" gives a cost/attention budget): polling /api/admin/usage
// every 3s means ~14 table-count queries per tick for as long as this stays open, which
// is fine for one admin actively watching a dashboard but not something to run by default
// on every page load. LIVE_WINDOW * LIVE_POLL_MS = a 3-minute rolling window, the same
// "recent activity" horizon a CPU/memory monitor typically shows.
const LIVE_POLL_MS = 3000;
const LIVE_WINDOW = 60;

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

export default function UsagePage() {
  const toast = useToast();
  const [usage, setUsage] = useState([]);
  const [totalDbCapacityBytes, setTotalDbCapacityBytes] = useState(null);
  const [actualDatabaseSizeBytes, setActualDatabaseSizeBytes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(1);
  const [egressSeries, setEgressSeries] = useState(null);
  const [egressLoading, setEgressLoading] = useState(false);

  // Live Monitor — a rolling buffer of real snapshots (totalRows/approxBytes/egressBytes
  // per shop), polled while liveMode is on. The chart itself is the DELTA between
  // consecutive snapshots divided by the real elapsed time — genuine rows/sec and
  // bytes/sec, computed from real numbers, the same way a CPU/memory monitor derives a
  // load percentage from consecutive counter reads rather than a single instantaneous value.
  const [liveMode, setLiveMode] = useState(false);
  const [liveSamples, setLiveSamples] = useState([]);

  const applyUsageResponse = (data) => {
    setUsage(data.shops);
    setTotalDbCapacityBytes(data.totalDbCapacityBytes);
    setActualDatabaseSizeBytes(data.actualDatabaseSizeBytes);
    return data;
  };

  useEffect(() => {
    (async () => {
      try {
        await applyUsageResponse(await apiGet("/api/admin/usage"));
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!liveMode) return;
    const tick = async () => {
      try {
        const data = await apiGet("/api/admin/usage");
        applyUsageResponse(data);
        const snapshot = { t: Date.now(), shops: {} };
        data.shops.forEach((s) => {
          snapshot.shops[s.id] = { totalRows: s.totalRows, approxBytes: s.approxBytes, egressBytes: s.egressBytes };
        });
        setLiveSamples((prev) => [...prev, snapshot].slice(-LIVE_WINDOW));
      } catch (err) {
        // A single missed tick shouldn't toast-spam an admin watching a live chart — the
        // next tick tries again in LIVE_POLL_MS regardless.
        console.error("Live Monitor poll failed:", err);
      }
    };
    tick();
    const interval = setInterval(tick, LIVE_POLL_MS);
    return () => clearInterval(interval);
  }, [liveMode]);

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
  // Quota Used is checked against estimatedRealBytes (this shop's share of the actual,
  // index-inclusive database size), not the raw approxBytes row-content sum — see
  // adminService.js's getUsageByShop for why the two numbers differ.
  const quotaPercent =
    selected?.storage_quota_bytes ? (selected.estimatedRealBytes / selected.storage_quota_bytes) * 100 : null;

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
  const selectedRank = selected ? rankedUsage.findIndex((u) => u.id === selected.id) + 1 : null;

  // Ranked by estimatedRealBytes (the real, index-inclusive share), not approxBytes — same
  // reasoning as the Quota Used column: this is "who's actually using the most database,"
  // not just "whose rows are biggest."
  const topShopsChartData = useMemo(
    () =>
      usage
        .slice()
        .sort((a, b) => b.estimatedRealBytes - a.estimatedRealBytes)
        .slice(0, 8)
        .map((u) => ({ name: u.name, bytes: u.estimatedRealBytes })),
    [usage]
  );

  const selectShop = (u) => {
    setSelectedId(u.id);
    setQuery("");
  };
  const backToList = () => setSelectedId(null);

  // Rows/sec + egress bytes/sec — the delta between consecutive real snapshots divided by
  // real elapsed time, scoped to the selected shop when one is open, or summed across all
  // shops on the list view. Clamped at 0: a negative delta (e.g. a void reducing row count,
  // or the 30-day egress window itself rolling forward a day) reads as "no activity this
  // tick," not a fabricated negative rate.
  const liveActivitySeries = useMemo(() => {
    if (liveSamples.length < 2) return [];
    const shopId = selected?.id;
    const totals = (snap) =>
      shopId
        ? snap.shops[shopId] || { totalRows: 0, approxBytes: 0, egressBytes: 0 }
        : Object.values(snap.shops).reduce(
            (sum, s) => ({
              totalRows: sum.totalRows + s.totalRows,
              approxBytes: sum.approxBytes + s.approxBytes,
              egressBytes: sum.egressBytes + s.egressBytes,
            }),
            { totalRows: 0, approxBytes: 0, egressBytes: 0 }
          );
    const points = [];
    for (let i = 1; i < liveSamples.length; i++) {
      const prev = liveSamples[i - 1];
      const curr = liveSamples[i];
      const dtSec = (curr.t - prev.t) / 1000;
      if (dtSec <= 0) continue;
      const p = totals(prev);
      const c = totals(curr);
      points.push({
        time: new Date(curr.t).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
        rowsPerSec: Math.max(0, (c.totalRows - p.totalRows) / dtSec),
        egressBytesPerSec: Math.max(0, (c.egressBytes - p.egressBytes) / dtSec),
      });
    }
    return points;
  }, [liveSamples, selected]);

  // Real, per-day egress for the selected shop's last 30 days — fetched only when a shop is
  // actually open in the detail view, not for every shop up front.
  useEffect(() => {
    if (!selectedId) {
      setEgressSeries(null);
      return;
    }
    setEgressLoading(true);
    (async () => {
      try {
        const data = await apiGet(`/api/admin/shops/${selectedId}/egress-series?days=30`);
        setEgressSeries(
          data.series.map((row) => ({ ...row, label: row.day.slice(5) })) // "MM-DD", enough context for a 30-day window
        );
      } catch (err) {
        toast.error(err.message);
      } finally {
        setEgressLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div className="min-h-screen bg-surface-subtle dark:bg-gray-900">
      <Helmet>
        <title>Usage · Platform Admin</title>
      </Helmet>

      <AdminHeader />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">Resource Usage</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              One shared database, no per-tenant infrastructure — usage here is measured
              directly from each shop's own row counts, actual row sizes, and real response
              bytes sent, never inferred.
            </p>
            {totalDbCapacityBytes != null && (
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Every shop's "Quota Used" below is a share of the total DB capacity — change it
                from the Shops tab's Platform Settings button.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (liveMode) setLiveSamples([]);
              setLiveMode((prev) => !prev);
            }}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              liveMode
                ? "bg-danger-600 text-white-A700 hover:bg-danger-700"
                : "border border-surface-border text-gray-700 hover:bg-surface-muted dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {liveMode ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white-A700 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white-A700" />
                </span>
                Stop Live Monitor
                <HiOutlineStop className="text-base" />
              </>
            ) : (
              <>
                <HiOutlinePlay className="text-base" />
                Start Live Monitor
              </>
            )}
          </button>
        </div>

        {actualDatabaseSizeBytes != null && totalDbCapacityBytes != null && (
          <div className="mb-6">
            <ShareBar
              label="Actual database size (real, measured — pg_database_size)"
              note={`${formatBytes(actualDatabaseSizeBytes)} of ${formatBytes(totalDbCapacityBytes)} plan capacity (${(
                (actualDatabaseSizeBytes / totalDbCapacityBytes) *
                100
              ).toFixed(2)}%) — includes indexes and storage overhead the per-shop numbers below don't`}
              percent={(actualDatabaseSizeBytes / totalDbCapacityBytes) * 100}
              colorClass={quotaBarColorClass((actualDatabaseSizeBytes / totalDbCapacityBytes) * 100)}
            />
          </div>
        )}

        {liveMode && (
          <div className="mb-6 rounded-xl2 border border-danger-500/40 bg-white-A700 p-5 shadow-card dark:bg-gray-800">
            <div className="mb-1 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-danger-600" />
              </span>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Live Activity {selected ? `— ${selected.name}` : "— All Shops"}
              </p>
            </div>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              Polling every {LIVE_POLL_MS / 1000}s, {LIVE_WINDOW}-tick rolling window (~
              {Math.round((LIVE_POLL_MS * LIVE_WINDOW) / 60000)} min) — each point is the real
              change in row count / egress between two consecutive polls, divided by the real
              time between them, the same way a CPU/memory monitor derives a load line from
              consecutive counter reads.
            </p>
            {liveActivitySeries.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Collecting the first sample…</p>
            ) : (
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-1">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Rows / sec
                  </p>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={liveActivitySeries} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                      <XAxis dataKey="time" stroke={AXIS_COLOR} fontSize={10} interval="preserveStartEnd" />
                      <YAxis stroke={AXIS_COLOR} fontSize={10} width={32} allowDecimals={false} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value) => [`${value.toFixed(2)} rows/sec`, "Write rate"]}
                      />
                      <Line type="monotone" dataKey="rowsPerSec" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Egress / sec
                  </p>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={liveActivitySeries} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                      <XAxis dataKey="time" stroke={AXIS_COLOR} fontSize={10} interval="preserveStartEnd" />
                      <YAxis tickFormatter={(v) => formatBytes(v)} stroke={AXIS_COLOR} fontSize={10} width={48} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value) => [`${formatBytes(value)}/sec`, "Throughput"]}
                      />
                      <Line type="monotone" dataKey="egressBytesPerSec" stroke={BAR_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {!selected ? (
          <>
            {topShopsChartData.length > 1 && (
              <div className="mb-6 rounded-xl2 border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
                <p className="mb-4 text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Top shops by real DB usage
                </p>
                <ResponsiveContainer width="100%" height={Math.max(topShopsChartData.length * 34, 100)}>
                  <BarChart data={topShopsChartData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                    <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => formatBytes(v)} stroke={AXIS_COLOR} fontSize={12} />
                    <YAxis type="category" dataKey="name" width={140} stroke={AXIS_COLOR} fontSize={12} />
                    <Tooltip
                      cursor={{ fill: "#9ca3af1a" }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [formatBytes(value), "Estimated real size"]}
                    />
                    <Bar dataKey="bytes" fill={BAR_COLOR} radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

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
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Quota Allotted</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Quota Used</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Egress (30d)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                      {pagedUsage.map((u) => {
                        const share = grandTotalBytes > 0 ? (u.approxBytes / grandTotalBytes) * 100 : 0;
                        const quotaPct = u.storage_quota_bytes ? (u.estimatedRealBytes / u.storage_quota_bytes) * 100 : null;
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
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                              {u.storage_quota_bytes ? formatBytes(u.storage_quota_bytes) : (
                                <span className="text-gray-400 dark:text-gray-500">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {quotaPct === null ? (
                                <span className="text-gray-400 dark:text-gray-500">No quota</span>
                              ) : (
                                <>
                                  <span className={`font-semibold ${quotaTextColorClass(quotaPct)}`}>{quotaPct.toFixed(1)}%</span>
                                  <p className="text-xs text-gray-400 dark:text-gray-500">
                                    {formatBytes(u.estimatedRealBytes)} used
                                  </p>
                                </>
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
              {selectedRank && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  #{selectedRank} of {usage.length} shop{usage.length === 1 ? "" : "s"} by real DB usage
                </span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-4 sm:grid-cols-1">
              <StatTile label="Total rows" value={selected.totalRows.toLocaleString()} />
              <StatTile label="Approx size (row content)" value={formatBytes(selected.approxBytes)} />
              <StatTile label="Estimated real size" value={formatBytes(selected.estimatedRealBytes)} />
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
                note={`${formatBytes(selected.estimatedRealBytes)} (estimated real usage) of ${formatBytes(selected.storage_quota_bytes)} allotted (${quotaPercent.toFixed(1)}%)${
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

              {egressLoading ? (
                <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">Loading daily trend…</p>
              ) : egressSeries && egressSeries.some((row) => row.bytes > 0) ? (
                <div className="mt-4">
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={egressSeries} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                      <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                      <XAxis dataKey="label" stroke={AXIS_COLOR} fontSize={11} interval={4} />
                      <YAxis tickFormatter={(v) => formatBytes(v)} stroke={AXIS_COLOR} fontSize={11} width={56} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value, _name, props) => [
                          `${formatBytes(value)} · ${props.payload.requestCount} request${props.payload.requestCount === 1 ? "" : "s"}`,
                          "Egress",
                        ]}
                      />
                      <Line type="monotone" dataKey="bytes" stroke={BAR_COLOR} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">No requests recorded in the last 30 days.</p>
              )}
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
