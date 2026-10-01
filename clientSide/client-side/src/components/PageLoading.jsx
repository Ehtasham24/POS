import { useEffect, useState } from "react";
import Logo from "components/Logo";
import { useLanguage } from "i18n/LanguageContext";

// Shown while a page's code loads the first time it's opened (App.jsx's Suspense). It fills
// the screen in the app's own background, so a page change never flashes white, and only
// shows the spinner after a moment, so a quick load is just a blink of the background.
export default function PageLoading() {
  const { t } = useLanguage();
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSpinner(true), 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-subtle dark:bg-gray-900"
      role="progressbar"
      aria-busy="true"
      aria-label={t("common.loading")}
    >
      {showSpinner && (
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-primary-100 border-t-primary-600 motion-safe:animate-spin dark:border-gray-800 dark:border-t-primary-500" />
            <Logo className="h-9 w-9" />
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t("common.loading")}</p>
        </div>
      )}
    </div>
  );
}
