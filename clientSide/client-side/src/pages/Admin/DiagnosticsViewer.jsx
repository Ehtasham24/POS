import { useMemo, useState } from "react";
import { HiOutlineArrowDownTray } from "react-icons/hi2";
import { cardClass, buttonClass, formatDateTime } from "./shared";

// What a ticket carries for working out the problem (Sevices/supportService.js's
// buildDiagnostics): the app's log of the half hour before the report, the environment, a
// register's own report, and the server's errors for the shop. Everything is shown as text.

const isProblem = (e) =>
  e.type === "error" ||
  (e.type === "console" && e.level === "error") ||
  (e.type === "toast" && e.level === "error") ||
  (e.type === "api" && (e.status == null || e.status >= 500));
const isWarning = (e) => !isProblem(e) && ((e.type === "api" && e.status >= 400) || e.type === "toast" || e.type === "console" || (e.type === "network" && e.message === "Offline"));

const FILTERS = [
  ["all", "Everything", () => true],
  ["problems", "Problems", (e) => isProblem(e) || isWarning(e)],
  ["api", "Requests", (e) => e.type === "api"],
  ["nav", "Pages", (e) => e.type === "nav"],
  ["shown", "Shown to user", (e) => e.type === "toast"],
];

const TYPE_LABEL = { nav: "Page", api: "Request", error: "Error", console: "Console", toast: "Shown", network: "Network", app: "App" };

const describe = (e) => {
  switch (e.type) {
    case "nav":
      return e.path;
    case "api":
      return `${e.method} ${e.path} → ${e.status ?? "no answer"}${e.ms != null ? ` (${e.ms} ms)` : ""}${e.error ? ` — ${e.error}` : ""}`;
    case "error":
      return `${e.message}${e.where ? ` @ ${e.where}` : ""}`;
    case "console":
    case "toast":
      return `${e.level}: ${e.message}`;
    case "app":
      return `${e.message}${e.build ? ` (${e.build})` : ""}`;
    default:
      return e.message || JSON.stringify(e);
  }
};

// "4m 12s before" the report was sent.
const before = (at, capturedAt) => {
  const seconds = Math.max(0, Math.round((new Date(capturedAt) - new Date(at)) / 1000));
  if (seconds < 60) return `${seconds}s before`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s before`;
};

function KeyValues({ values }) {
  const rows = Object.entries(values || {}).filter(([, v]) => v != null && v !== "");
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="font-semibold text-gray-600 dark:text-gray-300">{key}</dt>
          <dd className="break-all font-mono text-gray-700 dark:text-gray-200">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ServerErrors({ errors, empty }) {
  if (!errors?.length) return <p className="text-xs text-gray-500 dark:text-gray-400">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-xs">
      {errors.map((err, index) => (
        <li key={index} className="rounded-lg bg-danger-50 px-3 py-2 font-mono text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">
          {formatDateTime(err.at)} · {err.method} {err.path} → {err.status}: {err.message}
        </li>
      ))}
    </ul>
  );
}

export default function DiagnosticsViewer({ ticketId, diagnostics }) {
  const [filter, setFilter] = useState("all");
  const client = diagnostics?.client;
  const entries = useMemo(() => client?.entries || [], [client]);
  const counts = useMemo(
    () => ({
      problems: entries.filter(isProblem).length,
      failedRequests: entries.filter((e) => e.type === "api" && (e.status == null || e.status >= 400)).length,
    }),
    [entries]
  );

  if (!diagnostics) {
    return (
      <div className={`${cardClass} p-4 text-sm text-gray-500 dark:text-gray-400`}>
        The sender chose not to include diagnostic logs with this ticket.
      </div>
    );
  }

  const download = () => {
    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-${ticketId}-diagnostics.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shown = entries.filter(FILTERS.find(([key]) => key === filter)[2]);
  const { register, ...environment } = client?.environment || {};

  return (
    <div className="flex flex-col gap-4">
      <div className={`${cardClass} p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Diagnostics</h2>
          <button type="button" onClick={download} className={buttonClass.secondary}>
            <span className="inline-flex items-center gap-1.5">
              <HiOutlineArrowDownTray /> Download JSON
            </span>
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {entries.length} log entries from the {client?.windowMinutes ?? 30} minutes before it was sent
          {client?.truncated ? " (oldest dropped to fit)" : ""} · {counts.problems} problems · {counts.failedRequests} failed requests
        </p>
        <KeyValues values={environment} />
      </div>

      {(register || diagnostics.device) && (
        <div className={`${cardClass} p-4`}>
          <h3 className="mb-2 text-sm font-bold text-gray-800 dark:text-gray-100">Register</h3>
          <KeyValues values={{ ...register, ...(diagnostics.device ? { ...diagnostics.device, serverErrors: undefined } : {}) }} />
          {diagnostics.device && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">The register's own server errors (last hour)</p>
              <ServerErrors errors={diagnostics.device.serverErrors} empty="None." />
            </div>
          )}
        </div>
      )}

      <div className={`${cardClass} p-4`}>
        <h3 className="mb-2 text-sm font-bold text-gray-800 dark:text-gray-100">Cloud server errors for this shop (last {diagnostics.server?.windowMinutes ?? 60} min)</h3>
        <ServerErrors errors={diagnostics.server?.errors} empty="None logged (since the server last restarted)." />
      </div>

      {client && (
        <div className={cardClass}>
          <div className="flex flex-wrap gap-1.5 border-b border-surface-border p-3 dark:border-gray-700">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  filter === key ? "bg-primary-600 text-white-A700" : "bg-surface-muted text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">Nothing of this kind in the log.</p>
          ) : (
            <ol className="max-h-[32rem] divide-y divide-surface-border overflow-y-auto font-mono text-xs dark:divide-gray-700">
              {shown.map((e, index) => (
                <li
                  key={index}
                  className={`flex gap-3 px-4 py-2 ${
                    isProblem(e) ? "bg-danger-50 dark:bg-danger-500/10" : isWarning(e) ? "bg-amber-50 dark:bg-amber-500/10" : ""
                  }`}
                >
                  <span className="w-28 shrink-0 text-gray-500 dark:text-gray-400" title={formatDateTime(e.t)}>
                    {before(e.t, client.capturedAt)}
                  </span>
                  <span className="w-16 shrink-0 font-semibold text-gray-600 dark:text-gray-300">{TYPE_LABEL[e.type] || e.type}</span>
                  <span className="min-w-0 flex-1 break-all text-gray-800 dark:text-gray-100">
                    {describe(e)}
                    {e.stack && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-gray-500">stack</summary>
                        <pre className="whitespace-pre-wrap text-[11px] text-gray-600 dark:text-gray-300">{e.stack}</pre>
                      </details>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
