// "just now" / "5 min ago" / "3 h ago" / "12 days ago"; `never` for no date. The words come from
// the caller, so the shop app can say it in the chosen language (translations.js, `time`) and the
// English-only admin console can use its own (pages/Admin/shared.js).
export const formatTimeAgo = (value, words) => {
  if (!value) return words.never;
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return words.justNow;
  if (seconds < 3600) return words.minutes(Math.floor(seconds / 60));
  if (seconds < 86400) return words.hours(Math.floor(seconds / 3600));
  return words.days(Math.floor(seconds / 86400));
};

// The shop app's version, from `t`.
export const timeAgoIn = (t) => (value) =>
  formatTimeAgo(value, {
    never: t("time.never"),
    justNow: t("time.justNow"),
    minutes: (n) => t("time.minutesAgo", { n }),
    hours: (n) => t("time.hoursAgo", { n }),
    days: (n) => t(n === 1 ? "time.dayAgo" : "time.daysAgo", { n }),
  });
