import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SkeletonRows, Pagination } from "components";
import { TicketStatusBadge, TicketKindBadge, TICKET_STATUSES } from "components/Support";
import useDebounce from "hooks/useDebounce";
import { apiGet } from "utils/api";
import AdminPage from "./AdminPage";
import { cardClass, inputClass, timeAgo } from "./shared";

const STATUS_LABEL = {
  open: "Open",
  in_review: "In review",
  planned: "Planned",
  in_progress: "In progress",
  resolved: "Resolved",
  wont_fix: "Won't do",
};

const PRIORITIES = ["urgent", "high", "normal", "low"];
const PRIORITY_LABEL = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};
const PRIORITY_TONE = {
  urgent: "bg-danger-600 text-white-A700",
  high: "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400",
  normal: "bg-surface-muted text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  low: "bg-surface-muted text-gray-500 dark:bg-gray-700 dark:text-gray-400",
};
const DAY_MS = 24 * 60 * 60 * 1000;

// Priority is the admin's own (never shown to the shop). `quiet`: "Normal" isn't worth a badge.
export function PriorityBadge({ priority, quiet = false }) {
  if (quiet && priority === "normal") return null;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${PRIORITY_TONE[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const chipClass = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold";

// The tickets as rows (newest activity first, ones not looked at yet on top). Used
// here and on a shop's detail panel (`shopId`).
// `hideDuplicates`: tickets that follow another one are left out (they're counted on it).
export function TicketsTable({ shopId, state = "all", kind = "", priority = "", q = "", hideDuplicates = false, compact = false }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);

  useEffect(() => setPage(1), [shopId, state, kind, priority, q, hideDuplicates]);
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ state, page: String(page) });
    if (kind) params.set("kind", kind);
    if (priority) params.set("priority", priority);
    if (hideDuplicates) params.set("hideDuplicates", "1");
    if (q) params.set("q", q);
    if (shopId) params.set("shopId", String(shopId));
    setData(null);
    apiGet(`/api/admin/support/tickets?${params}`)
      .then((result) => alive && setData(result))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [shopId, state, kind, priority, q, hideDuplicates, page]);

  if (error) return <p className="px-4 py-3 text-sm text-danger-600">{error}</p>;
  if (!data) return <SkeletonRows count={compact ? 3 : 6} />;
  if (data.tickets.length === 0) return <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No tickets.</p>;
  return (
    <>
      <ul className="divide-y divide-surface-border dark:divide-gray-700">
        {data.tickets.map((ticket) => (
          <li key={ticket.id}>
            <Link to={`/admin/tickets/${ticket.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-subtle dark:hover:bg-gray-700/60">
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {ticket.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary-600" title="New ticket, not looked at yet" />}
                  <span className={`truncate text-sm ${ticket.unread ? "font-bold" : "font-medium"} text-gray-800 dark:text-gray-100`}>{ticket.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <PriorityBadge priority={ticket.priority} quiet />
                  <TicketStatusBadge status={ticket.status} />
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <TicketKindBadge kind={ticket.kind} />
                {ticket.duplicate_count > 0 && (
                  <span className={`${chipClass} bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300`}>
                    +{ticket.duplicate_count} report
                    {ticket.duplicate_count === 1 ? "" : "s"} · {ticket.shops_affected} shop
                    {ticket.shops_affected === 1 ? "" : "s"}
                  </span>
                )}
                {ticket.duplicate_of && (
                  <span className={`${chipClass} bg-surface-muted text-gray-600 dark:bg-gray-700 dark:text-gray-300`}>Duplicate of #{ticket.duplicate_of}</span>
                )}
                {ticket.stale && (
                  <span className={`${chipClass} bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300`}>
                    Waiting {Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / DAY_MS)} days
                  </span>
                )}
                <span>#{ticket.id}</span>
                {!compact && <span className="font-medium text-gray-700 dark:text-gray-300">· {ticket.shop_name}</span>}
                <span>
                  · {ticket.opened_by_name} ({ticket.opened_by_role})
                </span>
                <span>· {timeAgo(ticket.last_event_at)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {data.totalPages > 1 && (
        <div className="flex justify-end border-t border-surface-border px-4 py-3 dark:border-gray-700">
          <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
        </div>
      )}
    </>
  );
}

// Every shop's bug reports and feature requests. Starts on the ones still open (or on what the
// Overview linked to: ?state=stale, ?priority=urgent). Duplicates are counted on their main
// ticket instead of listed.
export default function AdminTicketsPage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState(searchParams.get("state") || "active");
  const [priority, setPriority] = useState(searchParams.get("priority") || "");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounce(search.trim(), 300);

  return (
    <AdminPage title="Tickets" heading="Support tickets" subtitle="Bug reports and feature requests from every shop. Unread ones come first, then by priority.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={state} onChange={(e) => setState(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="active">Open (not resolved)</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
          <option value="stale">Waiting too long (open, 3+ days)</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              Only: {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">Bugs and features</option>
          <option value="bug">Bugs</option>
          <option value="feature">Feature requests</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={`${inputClass} w-auto`} aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, shop or #number…"
          className={`${inputClass} w-64 max-w-full`}
        />
      </div>
      <div className={cardClass}>
        <TicketsTable state={state} kind={kind} priority={priority} q={q} hideDuplicates />
      </div>
    </AdminPage>
  );
}

export { STATUS_LABEL, PRIORITIES, PRIORITY_LABEL };
