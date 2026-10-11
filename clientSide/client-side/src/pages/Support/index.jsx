import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { HiOutlinePlus, HiOutlineLifebuoy, HiOutlineBugAnt, HiOutlineLightBulb } from "react-icons/hi2";
import AppShell from "components/AppShell";
import { EmptyState, Modal, SkeletonRows } from "components";
import { TicketStatusBadge, TicketKindBadge, PicturePicker, toAttachments } from "components/Support";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { useAuth } from "auth/AuthContext";
import useDeviceStatus from "hooks/useDeviceStatus";
import { apiGet, apiPost } from "utils/api";
import { snapshotDiagnostics, diagnosticsSummary } from "utils/diagnosticsLog";
import { timeAgoIn } from "utils/timeAgo";
import { SUPPORT_CHANGED_EVENT } from "./events";

const inputClass =
  "block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";
const labelClass = "mb-1 block text-sm font-semibold text-gray-800 dark:text-gray-100";
const FILTERS = ["active", "closed", "all"];

// Reporting a problem or asking for a feature (Sevices/supportService.js). The report records
// where it came from, and — unless the person unticks it — the app's diagnostic log of the last
// half hour (utils/diagnosticsLog.js), so whoever looks into it can see what happened.
function NewTicketModal({ fromPage, onClose, onCreated }) {
  const { t } = useLanguage();
  const toast = useToast();
  const device = useDeviceStatus();
  const [kind, setKind] = useState("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pictures, setPictures] = useState([]);
  const [saving, setSaving] = useState(false);
  const [includeLogs, setIncludeLogs] = useState(true);
  const [logSummary] = useState(diagnosticsSummary);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await apiPost("/api/support/tickets", {
        kind,
        title: title.trim(),
        body: body.trim(),
        attachments: toAttachments(pictures),
        context: {
          page: fromPage || undefined,
          platform: device?.device ? device.platform : "web",
          appVersion: device?.appVersion,
          userAgent: navigator.userAgent,
          screen: `${window.innerWidth}x${window.innerHeight}`,
          language: document.documentElement.lang || undefined,
        },
        diagnostics: includeLogs ? snapshotDiagnostics(device) : undefined,
      });
      toast.success(t("support.created"));
      onCreated(created.id);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const kindButton = (value, Icon, label, hint) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      aria-pressed={kind === value}
      className={`flex flex-1 flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
        kind === value
          ? "border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-500/10"
          : "border-surface-border hover:bg-surface-subtle dark:border-gray-700 dark:hover:bg-gray-700"
      }`}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
        <Icon className="text-base" />
        {label}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{hint}</span>
    </button>
  );

  return (
    <Modal isOpen onClose={onClose} title={t("support.newTicket")} maxWidth="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex gap-2">
          {kindButton("bug", HiOutlineBugAnt, t("support.kindBug"), t("support.kindBugHint"))}
          {kindButton("feature", HiOutlineLightBulb, t("support.kindFeature"), t("support.kindFeatureHint"))}
        </div>
        <div>
          <label htmlFor="ticket_title" className={labelClass}>
            {t("support.title")}
          </label>
          <input
            id="ticket_title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            minLength={3}
            maxLength={150}
            required
            autoFocus
            placeholder={kind === "bug" ? t("support.titleBugPlaceholder") : t("support.titleFeaturePlaceholder")}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="ticket_body" className={labelClass}>
            {t("support.description")}
          </label>
          <textarea
            id="ticket_body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={5000}
            required
            placeholder={kind === "bug" ? t("support.bodyBugPlaceholder") : t("support.bodyFeaturePlaceholder")}
            className={inputClass}
          />
        </div>
        <div>
          <p className={labelClass}>{t("support.pictures")}</p>
          <PicturePicker pictures={pictures} onChange={setPictures} disabled={saving} />
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-surface-subtle p-3 dark:bg-gray-900">
          <input
            type="checkbox"
            checked={includeLogs}
            onChange={(e) => setIncludeLogs(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-400 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm">
            <span className="font-semibold text-gray-800 dark:text-gray-100">{t("support.includeLogs")}</span>
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
              {t("support.includeLogsHint", { n: logSummary.count, minutes: logSummary.windowMinutes })}
            </span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-muted px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving || title.trim().length < 3 || !body.trim()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t("support.sending") : t("support.submit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// The shop's tickets: a cashier's own, or all of the shop's for the owner. Newest activity
// first; a ticket with an answer not yet seen is marked.
export default function SupportPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState("active");
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(null);
  // ?new=1 (the account menu's "Report a problem") opens the form at once; ?from= is the page
  // it was opened from.
  const [creating, setCreating] = useState(searchParams.get("new") === "1");
  const fromPage = searchParams.get("from");
  const timeAgo = timeAgoIn(t);

  useEffect(() => {
    let alive = true;
    setTickets(null);
    setError(null);
    apiGet(`/api/support/tickets?state=${filter}`)
      .then((rows) => alive && setTickets(rows))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [filter]);

  return (
    <AppShell
      title={t("support.pageTitle")}
      actions={
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 hover:bg-primary-700"
        >
          <HiOutlinePlus className="text-base" />
          {t("support.newTicket")}
        </button>
      }
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {user?.role === "owner" ? t("support.introOwner") : t("support.introStaff")}
        </p>
        <div role="group" className="flex gap-1 self-start rounded-xl bg-surface-muted p-1 dark:bg-gray-800">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                filter === value ? "bg-white-A700 text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"
              }`}
            >
              {t(`support.filter_${value}`)}
            </button>
          ))}
        </div>

        {error ? (
          <p className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:bg-danger-500/10 dark:text-danger-400">{error}</p>
        ) : tickets === null ? (
          <div className="overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
            <SkeletonRows count={4} />
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState icon={HiOutlineLifebuoy} title={t("support.empty")} />
        ) : (
          <ul className="divide-y divide-surface-border overflow-hidden rounded-2xl border border-surface-border bg-white-A700 dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link to={`/support/${ticket.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-surface-subtle dark:hover:bg-gray-700/60">
                  <span className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      {ticket.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary-600" aria-label={t("support.newReply")} />}
                      <span className={`truncate text-sm ${ticket.unread ? "font-bold" : "font-medium"} text-gray-800 dark:text-gray-100`}>
                        {ticket.title}
                      </span>
                    </span>
                    <TicketStatusBadge status={ticket.status} />
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <TicketKindBadge kind={ticket.kind} />
                    <span>#{ticket.id}</span>
                    {!ticket.mine && <span>· {ticket.opened_by_name}</span>}
                    <span>· {timeAgo(ticket.last_event_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <NewTicketModal
          fromPage={fromPage}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            window.dispatchEvent(new CustomEvent(SUPPORT_CHANGED_EVENT));
            navigate(`/support/${id}`);
          }}
        />
      )}
    </AppShell>
  );
}
