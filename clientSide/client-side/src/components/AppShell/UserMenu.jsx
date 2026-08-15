import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineUserCircle, HiOutlineArrowRightOnRectangle } from "react-icons/hi2";
import { useAuth } from "auth/AuthContext";
import { useLanguage } from "i18n/LanguageContext";

// Sits next to OfflineStatusBadge/LowStockBell in both of AppShell's header clusters
// (mobile top bar, page top bar) — same small-status-widget pattern those two already
// use. Click-to-toggle + click-outside-to-close, same as InfoTooltip/PartyActionsMenu
// elsewhere in this app.
export default function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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
        <span className="hidden max-w-[8rem] truncate text-sm font-medium sm:inline">
          {user.displayName}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-48 rounded-xl border border-surface-border bg-white-A700 py-1.5 shadow-modal dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-surface-border px-3.5 py-2 dark:border-gray-700">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
              {user.displayName}
            </p>
            <p className="text-xs capitalize text-gray-500 dark:text-gray-400">
              {user.role === "owner" ? t("auth.roleOwner") : t("auth.roleCashier")}
            </p>
          </div>
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
    </div>
  );
}
