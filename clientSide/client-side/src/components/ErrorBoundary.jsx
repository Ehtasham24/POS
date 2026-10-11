import React from "react";
import { useLocation } from "react-router-dom";
import { HiOutlineExclamationTriangle } from "react-icons/hi2";
import { useLanguage } from "i18n/LanguageContext";
import { logError, flushDiagnostics, clearProblem } from "utils/diagnosticsLog";

// Pages that aren't a shop user's: no Support page to report from.
const NO_REPORT = /^\/(admin|login|device-setup|set-new-password)(\/|$)/;

// What's shown instead of a page that crashed while drawing (instead of a blank screen): reload,
// or report it. The crash is in the diagnostic log (utils/diagnosticsLog.js), written out before
// leaving, so the report — opened on a fresh load — carries it.
function CrashScreen({ pathname }) {
  const { t } = useLanguage();
  const report = () => {
    clearProblem();
    flushDiagnostics();
    window.location.assign(`/support?${new URLSearchParams({ new: "1", problem: "1", from: pathname })}`);
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle p-6 dark:bg-gray-900">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-surface-border bg-white-A700 p-6 text-center shadow-card dark:border-gray-700 dark:bg-gray-800">
        <HiOutlineExclamationTriangle className="mx-auto text-4xl text-amber-500" />
        <h1 className="mt-3 font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">{t("support.crashTitle")}</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{t("support.crashBody")}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 hover:bg-primary-700"
          >
            {t("support.crashReload")}
          </button>
          {!NO_REPORT.test(pathname) && (
            <button
              type="button"
              onClick={report}
              className="rounded-lg bg-surface-muted px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
            >
              {t("support.crashReport")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

class Boundary extends React.Component {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    logError(error, { prefix: "Page crashed: ", componentStack: info?.componentStack });
  }

  // Going to another page (the browser's Back) gets out of the crash screen.
  componentDidUpdate(prevProps) {
    if (this.state.crashed && prevProps.pathname !== this.props.pathname) this.setState({ crashed: false });
  }

  render() {
    return this.state.crashed ? <CrashScreen pathname={this.props.pathname} /> : this.props.children;
  }
}

export default function ErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <Boundary pathname={pathname}>{children}</Boundary>;
}
