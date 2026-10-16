import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { HiOutlineUserCircle, HiOutlineArrowRightOnRectangle, HiOutlineLifebuoy, HiOutlineKey, HiOutlineArrowPath } from "react-icons/hi2";
import { useAuth } from "auth/AuthContext";
import { useLanguage } from "i18n/LanguageContext";
import TextSizePicker from "components/TextSizePicker";
import ChangePasswordModal from "components/ChangePasswordModal";
import { useToast } from "components/Toast/ToastContext";
import useDeviceStatus, { refreshDeviceStatus } from "hooks/useDeviceStatus";
import { apiPost } from "utils/api";

// Sits next to OfflineStatusBadge/LowStockBell in both of AppShell's header clusters
// (mobile top bar, page top bar) — same small-status-widget pattern those two already
// use. Click-to-toggle + click-outside-to-close, same as InfoTooltip/PartyActionsMenu
// elsewhere in this app.
export default function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [checking, setChecking] = useState(false);
  const toast = useToast();
  // On a register that updates itself (the Android app): its version, and checking for a new one.
  const device = useDeviceStatus();
  const updates = Boolean(device?.update);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!user) return null;

  const checkForUpdates = async () => {
    setChecking(true);
    try {
      const state = await apiPost("/api/device/update/check");
      if (state.status === "error") toast.error(t("update.checkFailed", { message: state.error }));
      else if (state.status === "up-to-date") toast.success(t("update.upToDate"));
      else if (state.available) toast.info(t(state.status === "downloading" || state.status === "installing" ? "update.downloading" : "update.found", { version: state.available.version }));
      refreshDeviceStatus();
    } catch (err) {
      toast.error(t("update.checkFailed", { message: err.message }));
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Account menu"
        className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-gray-600 hover:bg-surface-muted dark:text-gray-300 dark:hover:bg-gray-700"
      >
        <HiOutlineUserCircle className="text-xl" />
        {/* This project's `sm:` is a max-width/mobile breakpoint (tailwind.config.js), not
            Tailwind's default min-width — so hiding by default and showing `sm:inline`
            had this backwards: hidden on spacious desktop, shown on the narrowest phones
            where header space is tightest. sm:hidden collapses it to icon-only exactly
            where room is actually short. */}
        <span className="max-w-[8rem] truncate text-sm font-medium sm:hidden">
          {user.displayName}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-surface-border bg-white-A700 py-1.5 shadow-modal dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-surface-border px-3.5 py-2 dark:border-gray-700">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
              {user.displayName}
            </p>
            <p className="text-xs capitalize text-gray-500 dark:text-gray-400">
              {user.role === "owner" ? t("auth.roleOwner") : t("auth.roleCashier")}
            </p>
          </div>
          {/* Here as well as in Settings: Settings is the owner's, and a cashier needs this too. */}
          <div className="border-b border-surface-border px-3.5 py-2.5 dark:border-gray-700">
            <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">{t("settings.textSizeTitle")}</p>
            <TextSizePicker compact />
          </div>
          {/* A report opened from here remembers the page it was opened on. */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate(`/support?new=1&from=${encodeURIComponent(pathname)}`);
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-surface-subtle dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <HiOutlineLifebuoy className="text-base" />
            {t("support.reportProblem")}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setChangingPassword(true);
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-surface-subtle dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <HiOutlineKey className="text-base" />
            {t("auth.changePassword")}
          </button>
          {updates && (
            <button
              type="button"
              onClick={checkForUpdates}
              disabled={checking}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-surface-subtle disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <HiOutlineArrowPath className={`text-base ${checking ? "motion-safe:animate-spin" : ""}`} />
              <span className="flex flex-col">
                {t("update.check")}
                <span className="text-xs text-gray-500 dark:text-gray-400">{t("update.version", { version: device.appVersion })}</span>
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-danger-600 transition-colors hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-500/10"
          >
            <HiOutlineArrowRightOnRectangle className="text-base" />
            {t("auth.logout")}
          </button>
        </div>
      )}
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
