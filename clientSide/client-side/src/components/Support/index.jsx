import { useRef, useState } from "react";
import { HiOutlineBugAnt, HiOutlineLightBulb, HiOutlinePhoto, HiOutlineXMark, HiOutlinePaperAirplane } from "react-icons/hi2";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { shrinkImage, dataUrlBytes } from "utils/shrinkImage";

// The pieces of a support ticket that the shop's pages (pages/Support) and the admin console
// (pages/Admin/Tickets) both show: its status and kind, its history, and the box to reply in.
// Words come from translations.js (`support`), so the shop sees them in its language.

export const TICKET_STATUSES = ["open", "in_review", "planned", "in_progress", "resolved", "wont_fix"];
export const CLOSED_STATUSES = ["resolved", "wont_fix"];
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

// A picture on a message: a thumbnail that opens full size.
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

// The ticket's history, oldest first. `viewer` is which side is looking ("shop" | "admin"):
// their own messages sit on the right. The other side's are named — on the shop's side, the
// platform's replies are signed "Support".
export function TicketTimeline({ events, viewer, attachmentUrl, formatTime }) {
  const { t } = useLanguage();
  return (
    <ol className="flex flex-col gap-3">
      {events.map((event) => {
        if (event.kind === "status") {
          const who = event.author_side === "admin" ? t("support.supportTeam") : event.author_name || t("support.shop");
          return (
            <li key={event.id} className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span>{t("support.statusChanged", { who })}</span>
              <TicketStatusBadge status={event.to_status} />
              <span>· {formatTime(event.created_at)}</span>
            </li>
          );
        }
        const mine = event.author_side === viewer;
        const author = event.author_side === "admin" ? t("support.supportTeam") : event.author_name || t("support.shop");
        return (
          <li key={event.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                mine ? "rounded-br-md bg-primary-600 text-white-A700" : "rounded-bl-md bg-surface-muted text-gray-800 dark:bg-gray-700 dark:text-gray-100"
              }`}
            >
              <p className={`mb-1 text-xs font-semibold ${mine ? "text-primary-100" : "text-gray-500 dark:text-gray-300"}`}>
                {author} · {formatTime(event.created_at)}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{event.body}</p>
              {event.attachments?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {event.attachments.map((a) => (
                    <Attachment key={a.id} src={attachmentUrl(a.id)} />
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export const MAX_PICTURES = 3;
const MAX_PICTURE_BYTES = 2 * 1024 * 1024;

// Pictures picked for a message, made small first (utils/shrinkImage.js). `pictures` is a
// list of data URLs.
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

// The reply box under a ticket. `extra` sits beside the send button (the admin's status
// picker). onSend({ body, pictures }) resolves when sent; the box clears then.
export function MessageComposer({ onSend, extra, allowEmpty = false, placeholder }) {
  const { t } = useLanguage();
  const [body, setBody] = useState("");
  const [pictures, setPictures] = useState([]);
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if ((!body.trim() && !allowEmpty) || sending) return;
    setSending(true);
    try {
      await onSend({ body: body.trim(), pictures });
      setBody("");
      setPictures([]);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-white-A700 p-4 dark:border-gray-700 dark:bg-gray-800">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder={placeholder || t("support.replyPlaceholder")}
        className="w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
      <PicturePicker pictures={pictures} onChange={setPictures} disabled={sending} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {extra}
        <button
          type="submit"
          disabled={sending || (!body.trim() && !allowEmpty)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <HiOutlinePaperAirplane className="text-base" />
          {sending ? t("support.sending") : t("support.send")}
        </button>
      </div>
    </form>
  );
}

// The pictures as the API takes them.
export const toAttachments = (pictures) => pictures.map((data) => ({ data }));
