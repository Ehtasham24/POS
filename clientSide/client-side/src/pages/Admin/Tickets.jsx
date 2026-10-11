import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

// The tickets as rows (newest activity first, ones not looked at yet on top). Used
// here and on a shop's detail panel (`shopId`).
export function TicketsTable({ shopId, state = "all", kind = "", q = "", compact = false }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);

  useEffect(() => setPage(1), [shopId, state, kind, q]);
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ state, page: String(page) });
    if (kind) params.set("kind", kind);
    if (q) params.set("q", q);
    if (shopId) params.set("shopId", String(shopId));
    setData(null);
    apiGet(`/api/admin/support/tickets?${params}`)
      .then((result) => alive && setData(result))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [shopId, state, kind, q, page]);

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
                <TicketStatusBadge status={ticket.status} />
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <TicketKindBadge kind={ticket.kind} />
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

// Every shop's bug reports and feature requests. Starts on the ones still open.
export default function AdminTicketsPage() {
  const [state, setState] = useState("active");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounce(search.trim(), 300);

  return (
    <AdminPage title="Tickets" heading="Support tickets" subtitle="Bug reports and feature requests from every shop. Unread ones come first.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={state} onChange={(e) => setState(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="active">Open (not resolved)</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
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
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or shop…" className={`${inputClass} w-64 max-w-full`} />
      </div>
      <div className={cardClass}>
        <TicketsTable state={state} kind={kind} q={q} />
      </div>
    </AdminPage>
  );
}

export { STATUS_LABEL };
