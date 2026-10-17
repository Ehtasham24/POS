import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineLifebuoy } from "react-icons/hi2";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet } from "utils/api";
import { SUPPORT_CHANGED_EVENT } from "pages/Support/events";

// Every few minutes, and only while the app is on screen: on a register each check goes to the
// cloud (device/readThrough.js), one small server for every shop.
const POLL_MS = 5 * 60 * 1000;

// Answers on this user's support tickets they haven't seen yet. Invisible until there's one
// (like StorageWarningBadge), then a lifebuoy with the count that opens the Support page.
// Errors (offline register, no cloud) just leave it hidden.
export default function SupportBadge() {
  const { t } = useLanguage();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      apiGet("/api/support/unread", { background: true })
        .then((data) => alive && setCount(Number(data?.count) || 0))
        .catch(() => {});
    refresh();
    const interval = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    window.addEventListener(SUPPORT_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener(SUPPORT_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (!count) return null;
  return (
    <Link
      to="/support"
      aria-label={t("support.badge")}
      title={t("support.badge")}
      className="relative flex h-10 w-10 items-center justify-center rounded-xl text-primary-600 hover:bg-surface-muted dark:text-primary-400 dark:hover:bg-gray-800"
    >
      <HiOutlineLifebuoy className="text-xl" />
      <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1 text-[11px] font-bold text-white-A700 ring-2 ring-white-A700 dark:ring-gray-900">
        {count}
      </span>
    </Link>
  );
}
