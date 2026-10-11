import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { HiOutlineExclamationTriangle, HiOutlineXMark } from "react-icons/hi2";
import { useLanguage } from "i18n/LanguageContext";
import { currentProblem, clearProblem, onProblem } from "utils/diagnosticsLog";

// After something breaks (utils/diagnosticsLog.js raises it: an uncaught error, a server error
// on something the person did), a small card offers to report it — the ticket form opens with
// the log attached. Shown a few seconds after, once the error message itself has been read;
// "Not now" keeps it away for a while. Not on the Support pages themselves.
const SHOW_AFTER_MS = 4500;
const STALE_AFTER_MS = 5 * 60 * 1000;
const SNOOZE_MS = 30 * 60 * 1000;
const SNOOZE_KEY = "pos-problem-prompt-snooze";

const snoozed = () => {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY)) > Date.now();
  } catch {
    return false;
  }
};

export default function ProblemPrompt() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [problem, setProblem] = useState(currentProblem);
  const [visible, setVisible] = useState(false);

  useEffect(() => onProblem(setProblem), []);
  useEffect(() => {
    setVisible(false);
    if (!problem || snoozed()) return undefined;
    const wait = Math.max(0, problem.t + SHOW_AFTER_MS - Date.now());
    if (Date.now() - problem.t > STALE_AFTER_MS) return undefined;
    const timer = setTimeout(() => setVisible(true), wait);
    return () => clearTimeout(timer);
  }, [problem]);

  if (!visible || !problem || pathname.startsWith("/support")) return null;

  const notNow = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {}
    clearProblem();
  };
  const report = () => {
    clearProblem();
    navigate(`/support?${new URLSearchParams({ new: "1", problem: "1", from: `${pathname}${search}` })}`);
  };

  return (
    <div
      role="alertdialog"
      aria-labelledby="problem-prompt-title"
      className="fixed safe-top-4 right-4 z-[90] w-full max-w-sm rounded-xl border border-amber-500/30 bg-white-A700 p-4 shadow-modal animate-[toast-in_0.2s_ease-out] dark:border-gray-700 dark:bg-gray-800 sm:left-4 sm:right-4 sm:w-auto sm:max-w-none"
    >
      <div className="flex items-start gap-3">
        <HiOutlineExclamationTriangle className="mt-0.5 shrink-0 text-xl text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p id="problem-prompt-title" className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {t("support.problemPromptTitle")}
          </p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{t("support.problemPromptBody")}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={report} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white-A700 hover:bg-primary-700">
              {t("support.problemReport")}
            </button>
            <button
              type="button"
              onClick={notNow}
              className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              {t("support.problemNotNow")}
            </button>
          </div>
        </div>
        <button type="button" onClick={clearProblem} aria-label={t("support.problemDismiss")} className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <HiOutlineXMark className="text-lg" />
        </button>
      </div>
    </div>
  );
}
