import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Pagination from "components/Pagination";
import { SkeletonRows, EmptyState } from "components";
import { useToast } from "components/Toast/ToastContext";
import useUrlFilterState from "hooks/useUrlFilterState";
import useDebounce from "hooks/useDebounce";
import { apiGet } from "utils/api";
import AdminPage from "./AdminPage";
import { cardClass, thClass, tdClass, formatDateTime, timeAgo, AUDIT_ACTION_LABEL, auditDetails } from "./shared";

const PAGE_SIZE = 25;

const OUTCOME_CHIP = {
  success: "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500",
  failure: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  locked: "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-500",
};
const OUTCOME_LABEL = { success: "Signed in", failure: "Wrong password", locked: "Refused (locked)" };

const tabClass = (active) =>
  `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-primary-600 text-white-A700"
      : "bg-white-A700 text-gray-700 hover:bg-surface-muted dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
  }`;
const filterClass =
  "h-9 rounded-lg border border-surface-border bg-white-A700 px-3 text-sm text-gray-800 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";

// What happened on the platform: every change an admin made (admin_audit_log) and every
// sign-in attempt (login_events), filtered and paged on the server.
export default function AdminActivity() {
  const toast = useToast();
  const [tab, setTab] = useUrlFilterState("tab", "audit");
  const [outcome, setOutcome] = useUrlFilterState("outcome", "");
  const [action, setAction] = useUrlFilterState("action", "");
  const [shopId, setShopId] = useUrlFilterState("shopId", "");
  const [username, setUsername] = useState("");
  const debouncedUsername = useDebounce(username, 300);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState([]);
  const requestIdRef = useRef(0);

  useEffect(() => {
    apiGet("/api/admin/shops")
      .then(setShops)
      .catch(() => setShops([]));
  }, []);

  // The page belongs to the filters it was picked under: a filter change is page 1 in the same
  // render, not a request for the old page number first (same as the Sales Report's table).
  const filterKey = JSON.stringify([tab, outcome, action, shopId, debouncedUsername]);
  const [pageFor, setPageFor] = useState({ key: filterKey, page: 1 });
  const page = pageFor.key === filterKey ? pageFor.page : 1;
  const setPage = (next) => setPageFor({ key: filterKey, page: next });

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (shopId) params.set("shopId", shopId);
    if (tab === "audit" && action) params.set("action", action);
    if (tab === "logins" && outcome) params.set("outcome", outcome);
    if (tab === "logins" && debouncedUsername.trim()) params.set("username", debouncedUsername.trim());
    setLoading(true);
    apiGet(`${tab === "logins" ? "/api/admin/login-events" : "/api/admin/audit-log"}?${params}`)
      .then((result) => requestId === requestIdRef.current && setData({ tab, ...result }))
      .catch((err) => requestId === requestIdRef.current && toast.error(err.message))
      .finally(() => requestId === requestIdRef.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  const rows = data?.tab === tab ? data.rows : null;

  return (
    <AdminPage
      title="Activity"
      heading="Activity"
      subtitle="Every change made from this console, and every sign-in attempt on the platform."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setTab("audit")} className={tabClass(tab === "audit")}>
          Admin changes
        </button>
        <button type="button" onClick={() => setTab("logins")} className={tabClass(tab === "logins")}>
          Sign-ins
        </button>
        <span className="mx-1 h-6 w-px bg-surface-border dark:bg-gray-700" />
        <select value={shopId} onChange={(e) => setShopId(e.target.value)} className={filterClass} aria-label="Shop">
          <option value="">All shops</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {tab === "audit" ? (
          <select value={action} onChange={(e) => setAction(e.target.value)} className={filterClass} aria-label="Kind of change">
            <option value="">Every change</option>
            <option value="shop.">Shops</option>
            <option value="user.">Users</option>
            <option value="billing.">Billing</option>
            <option value="announcement.">Announcements</option>
            <option value="password_reset.">Password resets</option>
            <option value="platform.">Platform settings</option>
          </select>
        ) : (
          <>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={filterClass} aria-label="Outcome">
              <option value="">Every attempt</option>
              <option value="success">Signed in</option>
              <option value="failure">Wrong password</option>
              <option value="locked">Refused (locked)</option>
            </select>
            <input
              type="search"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className={`${filterClass} w-44`}
            />
          </>
        )}
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        {!rows ? (
          <SkeletonRows count={6} />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing matches these filters." />
        ) : (
          <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
            {tab === "audit" ? (
              <table className="w-full min-w-[44rem] table-auto">
                <thead className="bg-surface-subtle dark:bg-gray-900/40">
                  <tr>
                    <th className={thClass}>When</th>
                    <th className={thClass}>Change</th>
                    <th className={thClass}>Shop</th>
                    <th className={thClass}>Details</th>
                    <th className={thClass}>By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className={`${tdClass} whitespace-nowrap`} title={formatDateTime(r.created_at)}>
                        {timeAgo(r.created_at)}
                      </td>
                      <td className={`${tdClass} font-medium`}>{AUDIT_ACTION_LABEL[r.action] || r.action}</td>
                      <td className={tdClass}>
                        {r.shop_id ? (
                          <Link
                            to={`/admin/shops?shop=${r.shop_id}`}
                            className="text-primary-600 hover:underline dark:text-primary-400"
                          >
                            {r.shop_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${tdClass} text-xs text-gray-500 dark:text-gray-400`}>{auditDetails(r.details) || "—"}</td>
                      <td className={tdClass}>{r.admin_name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[44rem] table-auto">
                <thead className="bg-surface-subtle dark:bg-gray-900/40">
                  <tr>
                    <th className={thClass}>When</th>
                    <th className={thClass}>Username</th>
                    <th className={thClass}>Result</th>
                    <th className={thClass}>Shop</th>
                    <th className={thClass}>Address</th>
                    <th className={thClass}>Device</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className={`${tdClass} whitespace-nowrap`} title={formatDateTime(r.created_at)}>
                        {timeAgo(r.created_at)}
                      </td>
                      <td className={`${tdClass} font-medium`}>
                        {r.username}
                        {r.role && (
                          <span className="ml-1.5 text-xs font-normal capitalize text-gray-500 dark:text-gray-400">{r.role}</span>
                        )}
                      </td>
                      <td className={tdClass}>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${OUTCOME_CHIP[r.outcome]}`}>
                          {OUTCOME_LABEL[r.outcome]}
                        </span>
                      </td>
                      <td className={tdClass}>{r.shop_name || "—"}</td>
                      <td className={`${tdClass} font-mono text-xs`}>{r.ip || "—"}</td>
                      <td
                        className={`${tdClass} max-w-[16rem] truncate text-xs text-gray-500 dark:text-gray-400`}
                        title={r.user_agent || ""}
                      >
                        {r.user_agent || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {rows && data.totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border px-5 py-3 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.totalCount)} of {data.totalCount}
            </p>
            <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} loading={loading} />
          </div>
        )}
      </div>
    </AdminPage>
  );
}
