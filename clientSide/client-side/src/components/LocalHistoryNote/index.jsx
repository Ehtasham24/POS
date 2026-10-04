import { HiOutlineCloud } from "react-icons/hi2";
import { useLanguage } from "i18n/LanguageContext";
import { useTimezone } from "timezone/TimezoneContext";

// On a register answering from its own database (offline), Sales History and Sales Report only
// reach back to the oldest sale it keeps (device/readThrough.js) — said here, so a short list
// isn't mistaken for the whole history. `from` is that oldest sale's time (empty: none kept);
// `reason` is why it answered itself: "offline", or "sending" (online, still sending its newest
// sales to the cloud).
export default function LocalHistoryNote({ from, reason }) {
  const { t } = useLanguage();
  const { formatDateTime } = useTimezone();
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      <HiOutlineCloud className="mt-0.5 shrink-0 text-base" />
      <p>
        {reason === "sending"
          ? t("report.localHistorySending")
          : from
            ? t("report.localHistory", { date: formatDateTime(from, { dateStyle: "medium" }) })
            : t("report.localHistoryEmpty")}
      </p>
    </div>
  );
}
