import { useEffect, useState } from "react";
import { HiOutlineXMark, HiOutlineMegaphone, HiOutlineExclamationTriangle } from "react-icons/hi2";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet } from "utils/api";
import { SEVERITY_CLASS } from "utils/severity";

const REFRESH_MS = 10 * 60 * 1000;
// Dismissed announcements stay dismissed on this device; the subscription reminder only for
// this browser session, so it comes back the next day the app is opened.
const DISMISSED_KEY = "dismissedAnnouncements";
const REMINDER_KEY = "dismissedSubscriptionReminder";

const readDismissed = () => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY)) || [];
  } catch {
    return [];
  }
};

function Banner({ level, icon: Icon, children, onDismiss, dismissLabel }) {
  return (
    <div className={`flex items-start gap-3 border-b px-8 py-2.5 text-sm md:px-5 sm:px-4 ${SEVERITY_CLASS[level]}`}>
      <Icon className="mt-0.5 shrink-0 text-base" />
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="-my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-70 hover:opacity-100"
      >
        <HiOutlineXMark />
      </button>
    </div>
  );
}

// Banners from the platform at the top of every shop page: the admin's announcements, and —
// for the owner (the server only sends it to them) — a reminder when the subscription is due
// within a week or overdue. Offline, or on any error, it simply shows nothing.
export default function ShopNotices() {
  const { t } = useLanguage();
  const [notices, setNotices] = useState(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [reminderHidden, setReminderHidden] = useState(() => {
    try {
      return sessionStorage.getItem(REMINDER_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const load = () =>
      apiGet("/api/shop/notices")
        .then(setNotices)
        .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (!notices) return null;

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-50)));
    } catch {}
  };
  const hideReminder = () => {
    setReminderHidden(true);
    try {
      sessionStorage.setItem(REMINDER_KEY, "1");
    } catch {}
  };

  const sub = notices.subscription;
  const dueDate = sub?.dueOn ? new Date(sub.dueOn).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" }) : null;
  const reminder =
    !reminderHidden && sub && (sub.status === "due_soon" || sub.status === "overdue")
      ? {
          level: sub.status === "overdue" ? "critical" : "warning",
          text:
            sub.status === "overdue"
              ? t("notices.overdue", { date: dueDate, days: -sub.daysLeft })
              : sub.daysLeft === 0
                ? t("notices.dueToday")
                : t("notices.dueSoon", { date: dueDate, days: sub.daysLeft }),
        }
      : null;
  const announcements = notices.announcements.filter((a) => !dismissed.includes(a.id));
  if (!reminder && announcements.length === 0) return null;

  return (
    <div role="status">
      {reminder && (
        <Banner
          level={reminder.level}
          icon={HiOutlineExclamationTriangle}
          onDismiss={hideReminder}
          dismissLabel={t("notices.dismiss")}
        >
          {reminder.text}
        </Banner>
      )}
      {announcements.map((a) => (
        <Banner
          key={a.id}
          level={a.level}
          icon={HiOutlineMegaphone}
          onDismiss={() => dismiss(a.id)}
          dismissLabel={t("notices.dismiss")}
        >
          <span className="font-semibold">{a.title}</span>
          {a.body && <span className="ml-1.5 whitespace-pre-line">{a.body}</span>}
        </Banner>
      ))}
    </div>
  );
}
