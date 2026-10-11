import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { HiOutlineArrowLeft } from "react-icons/hi2";
import { SkeletonRows } from "components";
import { TicketStatusBadge, TicketKindBadge, TicketProgress, TicketReport, TicketHistory, TICKET_STATUSES } from "components/Support";
import { useToast } from "components/Toast/ToastContext";
import { apiGet, apiPatch, API_BASE_URL } from "utils/api";
import AdminPage from "./AdminPage";
import DiagnosticsViewer from "./DiagnosticsViewer";
import { TriageCard, DuplicatesCard } from "./TicketTriage";
import { cardClass, inputClass, buttonClass, formatDateTime } from "./shared";
import { STATUS_LABEL, PriorityBadge } from "./Tickets";
import { ADMIN_TICKETS_CHANGED_EVENT } from "./ticketEvents";

const CONTEXT_LABEL = {
  page: "Page",
  platform: "App",
  appVersion: "Version",
  screen: "Screen",
  language: "Language",
  userAgent: "Browser",
};

// One ticket for the platform admin: the report and who sent it from where, its diagnostics,
// the status — which is all the shop sees change (there's no conversation on a ticket) — and
// the admin's own triage: priority, a private note, and linking duplicates of the same problem.
export default function AdminTicketPage() {
  const { id } = useParams();
  const toast = useToast();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const show = (data) => {
    setTicket(data);
    setStatus(data.status);
    window.dispatchEvent(new CustomEvent(ADMIN_TICKETS_CHANGED_EVENT));
  };

  useEffect(() => {
    apiGet(`/api/admin/support/tickets/${id}`)
      .then(show)
      .catch((err) => setError(err.message));
  }, [id]);

  const saveStatus = async () => {
    setSaving(true);
    try {
      show(await apiPatch(`/api/admin/support/tickets/${id}/status`, { status }));
      toast.success(
        ticket.duplicates.length ? "Status updated on this ticket and its duplicates — the shops will see it" : "Status updated — the shop will see it"
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Triage (priority, note, duplicate-of); errors are shown, and rethrown so the card stays as it was.
  const updateTicket = async (changes) => {
    try {
      show(await apiPatch(`/api/admin/support/tickets/${id}`, changes));
      toast.success("Saved");
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  return (
    <AdminPage title={ticket ? `#${ticket.id} ${ticket.title}` : "Ticket"} maxWidth="max-w-5xl">
      <Link to="/admin/tickets" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
        <HiOutlineArrowLeft /> All tickets
      </Link>
      {error ? (
        <p className="text-sm text-danger-600">{error}</p>
      ) : !ticket ? (
        <SkeletonRows count={5} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className={`${cardClass} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="min-w-0 break-words font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">{ticket.title}</h1>
              <span className="flex shrink-0 items-center gap-1.5">
                <PriorityBadge priority={ticket.priority} />
                <TicketStatusBadge status={ticket.status} />
              </span>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <TicketKindBadge kind={ticket.kind} />
              <span>#{ticket.id}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">· {ticket.shop_name}</span>
              <span>({ticket.shop_tier})</span>
              <span>
                · {ticket.opened_by_name} @{ticket.opened_by_username} ({ticket.opened_by_role})
              </span>
              <span>· {formatDateTime(ticket.created_at)}</span>
            </p>
            <div className="mt-4">
              <TicketReport events={ticket.events} attachmentUrl={(attachmentId) => `${API_BASE_URL}/api/admin/support/attachments/${attachmentId}`} />
            </div>
            {Object.keys(ticket.context || {}).length > 0 && (
              <dl className="mt-4 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 rounded-lg bg-surface-subtle p-3 text-xs dark:bg-gray-900">
                {Object.entries(ticket.context).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="font-semibold text-gray-600 dark:text-gray-300">{CONTEXT_LABEL[key] || key}</dt>
                    <dd className="break-all text-gray-700 dark:text-gray-200">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="grid grid-cols-[1fr,18rem] items-start gap-4 md:grid-cols-1">
            <DiagnosticsViewer ticketId={ticket.id} diagnostics={ticket.diagnostics} />

            <div className="flex flex-col gap-4">
              <div className={`${cardClass} p-4`}>
                <h2 className="mb-3 text-sm font-bold text-gray-800 dark:text-gray-100">Status</h2>
                <TicketProgress status={ticket.status} />
                {ticket.main_ticket ? (
                  <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">Follows #{ticket.main_ticket.id} — change the status there.</p>
                ) : (
                  <div className="mt-4 flex flex-col gap-2">
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass} aria-label="New status">
                      {TICKET_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={saveStatus} disabled={saving || status === ticket.status} className={buttonClass.primary}>
                      {saving ? "Saving…" : "Update status"}
                    </button>
                    {ticket.duplicates.length > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">Also moves its {ticket.duplicates.length} duplicate(s).</p>
                    )}
                  </div>
                )}
              </div>
              <TriageCard ticket={ticket} onUpdate={updateTicket} />
              <DuplicatesCard ticket={ticket} onUpdate={updateTicket} />
              <div className={`${cardClass} p-4`}>
                <h2 className="mb-3 text-sm font-bold text-gray-800 dark:text-gray-100">History</h2>
                <TicketHistory ticket={ticket} formatTime={formatDateTime} />
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
