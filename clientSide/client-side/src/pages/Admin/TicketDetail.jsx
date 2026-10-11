import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { HiOutlineArrowLeft } from "react-icons/hi2";
import { SkeletonRows } from "components";
import { TicketStatusBadge, TicketKindBadge, TicketTimeline, MessageComposer, toAttachments, TICKET_STATUSES } from "components/Support";
import { useToast } from "components/Toast/ToastContext";
import { apiGet, apiPost, API_BASE_URL } from "utils/api";
import AdminPage from "./AdminPage";
import { cardClass, inputClass, formatDateTime } from "./shared";
import { STATUS_LABEL } from "./Tickets";
import { ADMIN_TICKETS_CHANGED_EVENT } from "./ticketEvents";

const CONTEXT_LABEL = { page: "Page", platform: "App", appVersion: "Version", screen: "Screen", language: "Language", userAgent: "Browser" };

// One ticket for the platform admin: who sent it from where, the conversation, and the reply
// box with the status picker — a reply and a status change go together as one update.
export default function AdminTicketPage() {
  const { id } = useParams();
  const toast = useToast();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");

  const show = (data) => {
    setTicket(data);
    setStatus(data.status);
    window.dispatchEvent(new CustomEvent(ADMIN_TICKETS_CHANGED_EVENT));
  };

  useEffect(() => {
    apiGet(`/api/admin/support/tickets/${id}`).then(show).catch((err) => setError(err.message));
  }, [id]);

  const send = async ({ body, pictures }) => {
    try {
      show(await apiPost(`/api/admin/support/tickets/${id}`, { body: body || undefined, attachments: toAttachments(pictures), status }));
      toast.success("Sent to the shop");
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  return (
    <AdminPage title={ticket ? `#${ticket.id} ${ticket.title}` : "Ticket"} maxWidth="max-w-4xl">
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
              <TicketStatusBadge status={ticket.status} />
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
            {Object.keys(ticket.context || {}).length > 0 && (
              <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 rounded-lg bg-surface-subtle p-3 text-xs dark:bg-gray-900">
                {Object.entries(ticket.context).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="font-semibold text-gray-600 dark:text-gray-300">{CONTEXT_LABEL[key] || key}</dt>
                    <dd className="break-all text-gray-700 dark:text-gray-200">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <TicketTimeline
            events={ticket.events}
            viewer="admin"
            attachmentUrl={(attachmentId) => `${API_BASE_URL}/api/admin/support/attachments/${attachmentId}`}
            formatTime={formatDateTime}
          />

          <MessageComposer
            onSend={send}
            allowEmpty={status !== ticket.status}
            placeholder="Reply to the shop… (or just change the status)"
            extra={
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto`}>
                  {TICKET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
        </div>
      )}
    </AdminPage>
  );
}
