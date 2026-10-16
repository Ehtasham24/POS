import { useState } from "react";
import { HiOutlineArrowPath, HiOutlineArrowDownTray } from "react-icons/hi2";
import { usePolledDeviceStatus } from "hooks/useDeviceStatus";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";

// A new version, downloaded and checked by the register (device/updater.js), offered once ready:
//   ready      new code: restart into it now (the app's native shell, MainActivity.PosShell), or
//              it's used at the next start anyway
//   app-ready  a new app: install it (Android asks the person to confirm)
// "Later" hides it until the page is reloaded. Only in the Android app.
export default function UpdateBanner() {
  const { t } = useLanguage();
  const toast = useToast();
  const [status] = usePolledDeviceStatus();
  const [later, setLater] = useState(null);
  const update = status?.update;
  const shell = window.PosShell;
  if (!update?.available || !shell || later === update.available.version) return null;
  if (update.status !== "ready" && update.status !== "app-ready") return null;

  const appUpdate = update.status === "app-ready";
  const act = () => {
    if (!appUpdate) return shell.restart();
    const result = shell.installApk(update.apkPath);
    if (result === "needs-permission") toast.info(t("update.allowInstall"));
    else if (result !== "started") toast.error(t("update.installFailed"));
    return undefined;
  };

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-primary-50 px-8 py-2.5 text-sm text-primary-800 dark:bg-primary-500/10 dark:text-primary-200 md:px-5 sm:px-4">
      {appUpdate ? <HiOutlineArrowDownTray className="shrink-0 text-base" /> : <HiOutlineArrowPath className="shrink-0 text-base" />}
      <span className="min-w-0 flex-1">{t(appUpdate ? "update.appReady" : "update.codeReady", { version: update.available.version })}</span>
      <span className="flex gap-2">
        <button type="button" onClick={act} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white-A700 hover:bg-primary-700">
          {t(appUpdate ? "update.install" : "update.restart")}
        </button>
        <button
          type="button"
          onClick={() => setLater(update.available.version)}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 dark:text-primary-300 dark:hover:bg-primary-500/20"
        >
          {t("update.later")}
        </button>
      </span>
    </div>
  );
}
