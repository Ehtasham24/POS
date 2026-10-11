import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { HiOutlineArrowLeft } from "react-icons/hi2";
import AppShell from "components/AppShell";
import { SkeletonRows } from "components";
import { TicketStatusBadge, TicketKindBadge, TicketTimeline, MessageComposer, toAttachments, CLOSED_STATUSES } from "components/Support";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { useTimezone } from "timezone/TimezoneContext";
import { apiGet, apiPost, API_BASE_URL } from "utils/api";
import { SUPPORT_CHANGED_EVENT } from "./events";

// One ticket: its history and the reply box. Opening it marks the answers in it as seen.
export default function SupportTicketPage() {
  const { id } = useParams();
  const { t } = useLanguage();
  const toast = useToast();
  const { formatDateTime } = useTimezone();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    apiGet(`/api/support/tickets/${id}`)
      .then((data) => {
        if (!alive) return;
        setTicket(data);
        window.dispatchEvent(new CustomEvent(SUPPORT_CHANGED_EVENT));
      })
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const reply = async ({ body, pictures }) => {
    try {
      setTicket(await apiPost(`/api/support/tickets/${id}/messages`, { body, attachments: toAttachments(pictures) }));
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  const formatTime = (value) => formatDateTime(value, { dateStyle: "medium", timeStyle: "short" });

  return (
    <AppShell title={t("support.pageTitle")}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Link to="/support" className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
          <HiOutlineArrowLeft /> {t("support.back")}
        </Link>
        {error ? (
          <p className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:bg-danger-500/10 dark:text-danger-400">{error}</p>
        ) : !ticket ? (
          <div className="overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
            <SkeletonRows count={4} />
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-surface-border bg-white-A700 p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 break-words font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">{ticket.title}</h2>
                <TicketStatusBadge status={ticket.status} />
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <TicketKindBadge kind={ticket.kind} />
                <span>#{ticket.id}</span>
                <span>· {t("support.openedBy", { name: ticket.opened_by_name || "—", when: formatTime(ticket.created_at) })}</span>
              </p>
            </div>

            <TicketTimeline
              events={ticket.events}
              viewer="shop"
              attachmentUrl={(attachmentId) => `${API_BASE_URL}/api/support/attachments/${attachmentId}`}
              formatTime={formatTime}
            />

            {CLOSED_STATUSES.includes(ticket.status) && (
              <p className="text-center text-xs text-gray-500 dark:text-gray-400">{t("support.closedHint")}</p>
            )}
            <MessageComposer onSend={reply} />
          </>
        )}
      </div>
    </AppShell>
  );
}
