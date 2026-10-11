import { useRef, useState } from "react";
import { HiOutlineBugAnt, HiOutlineLightBulb, HiOutlinePhoto, HiOutlineXMark, HiOutlineCheck } from "react-icons/hi2";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { shrinkImage, dataUrlBytes } from "utils/shrinkImage";

// The pieces of a support ticket that the shop's pages (pages/Support) and the admin console
// (pages/Admin/Tickets) both show: its kind and status, where it is on the way to done, the
// report itself, and the history of its status changes. A ticket is tracked by status only —
// the shop reports once and follows along; there's no conversation on it.
// Words come from translations.js (`support`), so the shop sees them in its language.

export const TICKET_STATUSES = ["open", "in_review", "planned", "in_progress", "resolved", "wont_fix"];
export const CLOSED_STATUSES = ["resolved", "wont_fix"];
// The way to done, in order. "Won't do" ends it off this path.
const PROGRESS = ["open", "in_review", "planned", "in_progress", "resolved"];
const STATUS_TONE = {
  open: "bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300",
  in_review: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  planned: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  in_progress: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  resolved: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  wont_fix: "bg-surface-muted text-gray-600 dark:bg-gray-700 dark:text-gray-300",
};

export function TicketStatusBadge({ status }) {
  const { t } = useLanguage();
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[status] || STATUS_TONE.open}`}>
      {t(`support.status_${status}`)}
    </span>
  );
}

export function TicketKindBadge({ kind }) {
  const { t } = useLanguage();
  const Icon = kind === "bug" ? HiOutlineBugAnt : HiOutlineLightBulb;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        kind === "bug" ? "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
      }`}
    >
      <Icon className="text-sm" />
      {t(kind === "bug" ? "support.kindBug" : "support.kindFeature")}
    </span>
  );
}

// Where the ticket is on the way to done: each step ticked once passed, the current one
// highlighted. A "won't do" ticket says so instead of the steps.
export function TicketProgress({ status }) {
  const { t } = useLanguage();
  if (status === "wont_fix") {
    return <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-300">{t("support.wontFixNote")}</p>;
  }
  const current = PROGRESS.indexOf(status);
  return (
    <ol className="flex items-start">
      {PROGRESS.map((step, index) => {
        const done = index < current || status === "resolved";
        const active = index === current;
        return (
          <li key={step} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${index === 0 ? "invisible" : index <= current ? "bg-primary-500" : "bg-surface-border dark:bg-gray-700"}`} />
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done ? "bg-primary-600 text-white-A700" : active ? "bg-primary-100 text-primary-700 ring-2 ring-primary-500 dark:bg-primary-500/20 dark:text-primary-300" : "bg-surface-muted text-gray-400 dark:bg-gray-700"
                }`}
              >
                {done ? <HiOutlineCheck /> : index + 1}
              </span>
              <span className={`h-0.5 flex-1 ${index === PROGRESS.length - 1 ? "invisible" : index < current ? "bg-primary-500" : "bg-surface-border dark:bg-gray-700"}`} />
            </div>
            <span className={`mt-1.5 px-0.5 text-[11px] leading-tight ${active ? "font-semibold text-gray-800 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>
              {t(`support.status_${step}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// A picture on the report: a thumbnail that opens full size.
function Attachment({ src }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="overflow-hidden rounded-lg border border-surface-border dark:border-gray-700">
        <img src={src} alt="" loading="lazy" className="h-20 w-20 object-cover" />
      </button>
      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title="" maxWidth="max-w-4xl">
          <img src={src} alt="" className="mx-auto max-h-[75vh] w-auto" />
        </Modal>
      )}
    </>
  );
}

// The report as it was sent: its first event (the description and its pictures).
export function TicketReport({ events, attachmentUrl }) {
  const report = events.find((e) => e.kind === "message");
  if (!report) return null;
  return (
    <div>
      <p className="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-100">{report.body}</p>
      {report.attachments?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {report.attachments.map((a) => (
            <Attachment key={a.id} src={attachmentUrl(a.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// When the ticket was opened and every status change since, newest first.
export function TicketHistory({ ticket, formatTime }) {
  const { t } = useLanguage();
  const changes = ticket.events.filter((e) => e.kind === "status").reverse();
  return (
    <ol className="relative flex flex-col gap-4 border-l border-surface-border pl-5 dark:border-gray-700">
      {changes.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full bg-primary-500 ring-4 ring-white-A700 dark:ring-gray-800" />
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <TicketStatusBadge status={event.to_status} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{formatTime(event.created_at)}</span>
          </div>
        </li>
      ))}
      <li className="relative">
        <span className="absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full bg-gray-400 ring-4 ring-white-A700 dark:ring-gray-800" />
        <p className="text-sm text-gray-700 dark:text-gray-200">
          {t("support.historyOpened", { name: ticket.opened_by_name || "—" })}
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{formatTime(ticket.created_at)}</span>
        </p>
      </li>
    </ol>
  );
}

export const MAX_PICTURES = 3;
const MAX_PICTURE_BYTES = 2 * 1024 * 1024;

// Pictures picked for a report, made small first (utils/shrinkImage.js). `pictures` is a list
// of data URLs.
export function PicturePicker({ pictures, onChange, disabled }) {
  const { t } = useLanguage();
  const toast = useToast();
  const inputRef = useRef(null);

  const add = async (files) => {
    const room = MAX_PICTURES - pictures.length;
    const picked = [...files].slice(0, room);
    if (files.length > room) toast.warning(t("support.picturesMax", { n: MAX_PICTURES }));
    const added = [];
    for (const file of picked) {
      try {
        const dataUrl = await shrinkImage(file);
        if (dataUrlBytes(dataUrl) > MAX_PICTURE_BYTES) toast.error(t("support.pictureTooBig"));
        else added.push(dataUrl);
      } catch {
        toast.error(t("support.notAPicture"));
      }
    }
    if (added.length) onChange([...pictures, ...added]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pictures.map((src, index) => (
        <div key={index} className="relative">
          <img src={src} alt="" className="h-14 w-14 rounded-lg object-cover" />
          <button
            type="button"
            aria-label={t("support.removePicture")}
            onClick={() => onChange(pictures.filter((_, i) => i !== index))}
            className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-white-A700"
          >
            <HiOutlineXMark className="text-sm" />
          </button>
        </div>
      ))}
      {pictures.length < MAX_PICTURES && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex h-14 items-center gap-1.5 rounded-lg border border-dashed border-surface-border px-3 text-xs font-medium text-gray-600 hover:bg-surface-subtle disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <HiOutlinePhoto className="text-lg" />
          {t("support.addPicture")}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files || []);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// The pictures as the API takes them.
export const toAttachments = (pictures) => pictures.map((data) => ({ data }));
