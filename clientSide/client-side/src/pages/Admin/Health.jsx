import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlinePause, HiOutlinePlay, HiOutlineCheckCircle, HiOutlineExclamationTriangle } from "react-icons/hi2";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { SkeletonRows } from "components";
import { useToast } from "components/Toast/ToastContext";
import { apiGet } from "utils/api";
import AdminPage from "./AdminPage";
import {
  Card,
  StatTile,
  cardClass,
  thClass,
  tdClass,
  buttonClass,
  formatBytes,
  formatDateTime,
  timeAgo,
  SEVERITY_CLASS,
  DeviceStateChip,
} from "./shared";

const REFRESH_MS = 15 * 1000;
const GRID_COLOR = "#9ca3af33";
const AXIS_COLOR = "#9ca3af";
const REQUEST_COLOR = "#4f46e5";
const ERROR_COLOR = "#dc2626";
const P50_COLOR = "#4f46e5";
const P95_COLOR = "#d97706";

// Past these the page says "degraded" — a request in two seconds is what a cashier notices.
const SLOW_P95_MS = 2000;
const HIGH_ERROR_RATE = 5;

const minuteLabel = (value) => new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const ms = (value) => (value == null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`);

const uptime = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};

const ChartTooltip = ({ active, payload, label, unit }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-gray-800 px-3 py-2 text-xs text-white-A700 shadow-lg">
      <p className="mb-1 font-semibold">{minuteLabel(label)}</p>
      {payload.map((item) => (
        <p key={item.dataKey}>
          {item.name}: <span className="font-semibold">{unit === "ms" ? ms(item.value) : item.value}</span>
        </p>
      ))}
    </div>
  );
};

const legendText = (value) => <span className="text-gray-600 dark:text-gray-300">{value}</span>;
const axis = { stroke: AXIS_COLOR, fontSize: 12, tickLine: false };

// What's wrong right now, worst first — the banner at the top of the page.
const problemsOf = (h) => {
  const problems = [];
  if (!h.database.ok) problems.push(`Database is not answering: ${h.database.error}`);
  if (h.database.pool?.waiting > 0) problems.push(`${h.database.pool.waiting} request(s) waiting for a database connection`);
  if (h.lastHour.errorRatePercent >= HIGH_ERROR_RATE)
    problems.push(`${h.lastHour.errorRatePercent}% of requests failed in the last hour`);
  else if (h.lastHour.serverErrors > 0) problems.push(`${h.lastHour.serverErrors} server error(s) in the last hour`);
  if (h.lastHour.p95Ms > SLOW_P95_MS) problems.push(`Slow responses: 95% finish within ${ms(h.lastHour.p95Ms)}`);
  if (h.logins?.topUsernames.some((u) => u.lockedNow)) problems.push("Accounts locked after repeated wrong passwords");
  for (const job of h.jobs) if (job.lastError) problems.push(`Background job "${job.name}" failed: ${job.lastError}`);
  const offlineLong = (h.devices || []).filter((d) => d.sync_state === "offline_long").length;
  if (offlineLong) problems.push(`${offlineLong} register(s) offline for over a day with sales not yet sent`);
  return problems;
};

// The admin console's live health page (Sevices/adminService.js's getPlatformHealth): is the
// API answering, how fast, what's failing, and is the database keeping up.
export default function AdminHealth() {
  const toast = useToast();
  const [health, setHealth] = useState(null);
  const [live, setLive] = useState(true);

  const load = async () => {
    try {
      setHealth(await apiGet("/api/admin/health"));
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    load();
    if (!live) return undefined;
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const problems = health ? problemsOf(health) : [];
  // Stacked, so the bar's full height is every request and the red part the failed ones.
  const requestSeries = health?.series.map((m) => ({ ...m, succeeded: m.requests - m.serverErrors }));
  const db = health?.database;

  return (
    <AdminPage
      title="Health"
      heading="System health"
      subtitle={
        health
          ? `Server up ${uptime(health.uptimeSeconds)} (since ${formatDateTime(health.startedAt)}). Live numbers reset when the server restarts.`
          : "Loading…"
      }
      actions={
        <button type="button" onClick={() => setLive((v) => !v)} className={`${buttonClass.secondary} flex items-center gap-1.5`}>
          {live ? <HiOutlinePause /> : <HiOutlinePlay />}
          {live ? `Live (every ${REFRESH_MS / 1000}s)` : "Paused"}
        </button>
      }
    >
      {!health ? (
        <div className={cardClass}>
          <SkeletonRows count={6} />
        </div>
      ) : (
        <div className="space-y-6">
          {problems.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-success-500/30 bg-success-50 px-4 py-3 text-sm font-medium text-success-700 dark:bg-success-500/10 dark:text-success-500">
              <HiOutlineCheckCircle className="text-lg" />
              All systems normal.
            </p>
          ) : (
            <ul className={`space-y-1 rounded-lg border px-4 py-3 text-sm ${SEVERITY_CLASS.critical}`}>
              {problems.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <HiOutlineExclamationTriangle className="mt-0.5 shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-4 gap-4 md:grid-cols-2 sm:grid-cols-1">
            <StatTile
              label="Requests / min"
              value={health.requestsPerMinute}
              note={`${health.lastHour.requests.toLocaleString()} in the last hour`}
            />
            <StatTile
              label="Server errors (1h)"
              value={health.lastHour.serverErrors}
              valueClassName={health.lastHour.serverErrors ? "text-danger-600" : undefined}
              note={`${health.lastHour.errorRatePercent}% of requests · ${health.lastHour.clientErrors} rejected (4xx)`}
            />
            <StatTile
              label="Response time (1h)"
              value={ms(health.lastHour.p95Ms)}
              valueClassName={health.lastHour.p95Ms > SLOW_P95_MS ? "text-danger-600" : undefined}
              note={`95% of requests faster · typical ${ms(health.lastHour.p50Ms)}`}
            />
            <StatTile
              label="Database"
              value={db.ok ? ms(db.pingMs) : "Down"}
              valueClassName={db.ok ? undefined : "text-danger-600"}
              note={db.ok ? `round trip · ${db.connections}/${db.maxConnections} connections` : db.error}
            />
          </div>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-1">
            <Card title="Requests per minute — last hour">
              <div className="px-3 pb-4 pt-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={requestSeries} margin={{ top: 4, left: 0, right: 12 }}>
                    <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                    <XAxis dataKey="minute" tickFormatter={minuteLabel} {...axis} minTickGap={24} />
                    <YAxis {...axis} axisLine={false} width={36} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: GRID_COLOR }} />
                    <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
                    <Bar dataKey="succeeded" name="Answered" stackId="a" fill={REQUEST_COLOR} isAnimationActive={false} />
                    <Bar
                      dataKey="serverErrors"
                      name="Server errors"
                      stackId="a"
                      fill={ERROR_COLOR}
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Response time — last hour">
              <div className="px-3 pb-4 pt-4">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={health.series} margin={{ top: 4, left: 0, right: 12 }}>
                    <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                    <XAxis dataKey="minute" tickFormatter={minuteLabel} {...axis} minTickGap={24} />
                    <YAxis {...axis} axisLine={false} width={48} tickFormatter={ms} />
                    <Tooltip content={<ChartTooltip unit="ms" />} />
                    <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
                    <Line
                      dataKey="p50"
                      name="Typical (p50)"
                      stroke={P50_COLOR}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="p95"
                      name="Slow (p95)"
                      stroke={P95_COLOR}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card title="Slowest endpoints (since start)">
            {health.slowestEndpoints.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">No requests yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] table-auto">
                  <thead>
                    <tr>
                      <th className={thClass}>Endpoint</th>
                      <th className={`${thClass} text-right`}>Calls</th>
                      <th className={`${thClass} text-right`}>Average</th>
                      <th className={`${thClass} text-right`}>p95</th>
                      <th className={`${thClass} text-right`}>Slowest</th>
                      <th className={`${thClass} text-right`}>Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                    {health.slowestEndpoints.map((e) => (
                      <tr key={e.label}>
                        <td className={`${tdClass} font-mono text-xs`}>{e.label}</td>
                        <td className={`${tdClass} text-right`}>{e.count.toLocaleString()}</td>
                        <td className={`${tdClass} text-right`}>{ms(e.avgMs)}</td>
                        <td className={`${tdClass} text-right font-semibold`}>{ms(e.p95Ms)}</td>
                        <td className={`${tdClass} text-right`}>{ms(e.maxMs)}</td>
                        <td className={`${tdClass} text-right ${e.serverErrors ? "font-semibold text-danger-600" : ""}`}>
                          {e.serverErrors}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Latest server errors">
            {health.recentErrors.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">None since the server started.</p>
            ) : (
              <ul className="divide-y divide-surface-border dark:divide-gray-700">
                {health.recentErrors.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="rounded bg-danger-50 px-1.5 py-0.5 text-xs font-semibold text-danger-600 dark:bg-danger-500/10">
                        {e.status}
                      </span>
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-200">
                        {e.method} {e.path}
                      </span>
                      {e.shopId && (
                        <Link
                          to={`/admin/shops?shop=${e.shopId}`}
                          className="text-xs text-primary-600 hover:underline dark:text-primary-400"
                        >
                          shop #{e.shopId}
                        </Link>
                      )}
                      <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{timeAgo(e.at)}</span>
                    </div>
                    <p className="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">{e.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-1">
            <Card title="Server and database">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm">
                <Stat
                  label="Memory in use"
                  value={`${formatBytes(health.process.heapUsedBytes)} of ${formatBytes(health.process.heapTotalBytes)}`}
                />
                <Stat label="Process memory" value={formatBytes(health.process.rssBytes)} />
                <Stat
                  label="Event-loop delay"
                  value={`${ms(health.process.eventLoopLagMs.p99)} (worst ${ms(health.process.eventLoopLagMs.max)})`}
                  hint="How long the server is stuck before it can answer anything"
                />
                <Stat label="Node.js" value={health.process.node} />
                <Stat
                  label="Connection pool"
                  value={`${db.pool.total - db.pool.idle} busy / ${db.pool.total} open / ${db.pool.max} max`}
                  hint={db.pool.waiting ? `${db.pool.waiting} waiting` : "none waiting"}
                />
                <Stat
                  label="Database size"
                  value={db.ok ? `${formatBytes(db.sizeBytes)} of ${formatBytes(db.capacityBytes)}` : "—"}
                />
              </dl>
            </Card>

            <Card title={`Shops online now (${health.onlineShops.length})`}>
              {health.onlineShops.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                  No shop has used the app in the last 5 minutes.
                </p>
              ) : (
                <ul className="divide-y divide-surface-border dark:divide-gray-700">
                  {health.onlineShops.map((s) => (
                    <li key={s.shopId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-success-500" />
                        <Link
                          to={`/admin/shops?shop=${s.shopId}`}
                          className="font-medium text-gray-800 hover:underline dark:text-gray-100"
                        >
                          {s.name}
                        </Link>
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{timeAgo(s.lastSeenAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {health.devices?.length > 0 && (
            <Card title={`Registers needing attention (${health.devices.length})`}>
              <ul className="divide-y divide-surface-border dark:divide-gray-700">
                {health.devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0">
                      <Link to={`/admin/shops?shop=${d.shop_id}`} className="font-medium text-gray-800 hover:underline dark:text-gray-100">
                        {d.shop_name}
                      </Link>{" "}
                      <span className="text-gray-600 dark:text-gray-300">
                        · {d.name} ({d.receipt_prefix})
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        Last seen {timeAgo(d.last_seen_at)}
                        {d.pending_count > 0 ? ` · ${d.pending_count} waiting to send` : ""}
                        {d.open_rejections > 0 ? ` · ${d.open_rejections} sync issue(s)` : ""}
                      </span>
                    </span>
                    <DeviceStateChip state={d.sync_state} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {health.logins && (
            <Card
              title="Sign-ins — last 24 hours"
              actions={
                <Link
                  to="/admin/activity?tab=logins&outcome=failure"
                  className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                  Full history
                </Link>
              }
            >
              <div className="grid grid-cols-3 gap-4 p-5 md:grid-cols-1">
                <div className="space-y-1 text-sm">
                  <p className="text-gray-500 dark:text-gray-400">Successful</p>
                  <p className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">
                    {health.logins.last24h.success}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400">Wrong password</p>
                  <p
                    className={`font-poppins text-xl font-bold ${health.logins.last24h.failure ? "text-amber-600" : "text-gray-800 dark:text-gray-100"}`}
                  >
                    {health.logins.last24h.failure}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400">Refused while locked</p>
                  <p
                    className={`font-poppins text-xl font-bold ${health.logins.last24h.locked ? "text-danger-600" : "text-gray-800 dark:text-gray-100"}`}
                  >
                    {health.logins.last24h.locked}
                  </p>
                  <p className="pt-2 text-xs text-gray-500 dark:text-gray-400">
                    A username locks for {health.logins.policy.windowMinutes} min after{" "}
                    {health.logins.policy.maxFailuresPerUsername} wrong passwords; an address after{" "}
                    {health.logins.policy.maxFailuresPerIp}.
                  </p>
                </div>
                <FailureList
                  title="Most failed usernames"
                  rows={health.logins.topUsernames}
                  name={(r) => (
                    <>
                      {r.username}
                      {r.lockedNow && (
                        <span className="ml-2 rounded bg-danger-50 px-1.5 text-xs font-semibold text-danger-600 dark:bg-danger-500/10">
                          locked
                        </span>
                      )}
                    </>
                  )}
                />
                <FailureList
                  title="Most failing addresses"
                  rows={health.logins.topIps}
                  name={(r) => `${r.ip} (${r.usernames} username${r.usernames === 1 ? "" : "s"})`}
                />
              </div>
            </Card>
          )}

          <Card title="Background jobs">
            {health.jobs.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                No job has run since the server started (the first runs within a few minutes).
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] table-auto">
                  <thead>
                    <tr>
                      <th className={thClass}>Job</th>
                      <th className={thClass}>Last run</th>
                      <th className={thClass}>Result</th>
                      <th className={`${thClass} text-right`}>Runs / failures</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                    {health.jobs.map((job) => (
                      <tr key={job.name}>
                        <td className={`${tdClass} font-medium`}>{job.name}</td>
                        <td className={tdClass}>{timeAgo(job.lastRunAt)}</td>
                        <td className={`${tdClass} ${job.lastError ? "text-danger-600" : "text-success-600"}`}>
                          {job.lastError ? job.lastError : "OK"}
                        </td>
                        <td className={`${tdClass} text-right`}>
                          {job.runs} / {job.failures}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </AdminPage>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div>
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-semibold text-gray-800 dark:text-gray-100">{value}</dd>
      {hint && <dd className="text-xs text-gray-500 dark:text-gray-400">{hint}</dd>}
    </div>
  );
}

function FailureList({ title, rows, name }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">None.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">{name(r)}</span>
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                {r.failures}× · {timeAgo(r.lastAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
