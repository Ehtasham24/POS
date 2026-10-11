import { useEffect, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineSun,
  HiOutlineMoon,
  HiOutlineKey,
  HiOutlineBuildingStorefront,
  HiOutlineChartBar,
  HiOutlineCalculator,
  HiOutlineSquares2X2,
  HiOutlineHeart,
  HiOutlineClipboardDocumentList,
  HiOutlineMegaphone,
  HiOutlineLifebuoy,
} from "react-icons/hi2";
import Logo from "components/Logo";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useAuth } from "auth/AuthContext";
import useTheme from "hooks/useTheme";
import { apiGet, apiPatch } from "utils/api";
import { ADMIN_TICKETS_CHANGED_EVENT } from "./ticketEvents";
import { inputClass, labelClass } from "./shared";
import PasswordResetRequestsBadge from "./PasswordResetRequestsBadge";

const emptyPasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

const NAV_TABS = [
  { to: "/admin", label: "Overview", icon: HiOutlineSquares2X2, end: true },
  { to: "/admin/shops", label: "Shops", icon: HiOutlineBuildingStorefront, end: false },
  { to: "/admin/health", label: "Health", icon: HiOutlineHeart, end: false },
  { to: "/admin/usage", label: "Usage", icon: HiOutlineChartBar, end: false },
  { to: "/admin/activity", label: "Activity", icon: HiOutlineClipboardDocumentList, end: false },
  { to: "/admin/announcements", label: "Announcements", icon: HiOutlineMegaphone, end: false },
  { to: "/admin/tickets", label: "Tickets", icon: HiOutlineLifebuoy, end: false, countsUnreadTickets: true },
  { to: "/admin/estimator", label: "Estimator", icon: HiOutlineCalculator, end: false },
];

const tabClass = ({ isActive }) =>
  `flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? "border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400"
      : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
  }`;

// Shared by every /admin/* page (Shops, Usage) — logo/title, the Shops<->Usage nav tabs
// (the "top navbar" both pages live under), and the three account-level actions (theme,
// change password, logout) that don't belong to either page specifically.
// Tickets with a shop message the admin hasn't read — shown on the Tickets tab.
const TICKETS_POLL_MS = 60000;
function useUnreadTickets() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      apiGet("/api/admin/support/unread")
        .then((data) => alive && setCount(Number(data?.count) || 0))
        .catch(() => {});
    refresh();
    const interval = setInterval(refresh, TICKETS_POLL_MS);
    window.addEventListener(ADMIN_TICKETS_CHANGED_EVENT, refresh);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener(ADMIN_TICKETS_CHANGED_EVENT, refresh);
    };
  }, []);
  return count;
}

export default function AdminHeader() {
  const unreadTickets = useUnreadTickets();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  // Called here (not on either page individually) — this is the one place mounted on
  // every /admin/* route, so <html>'s "dark" class stays synced from localStorage no matter
  // which admin page is landed on first after login.
  const [theme, toggleTheme] = useTheme();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login", { replace: true });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New password and confirmation don't match.");
      return;
    }
    setChangingPassword(true);
    try {
      await apiPatch("/api/admin/me/password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      toast.success("Password changed.");
      setShowPasswordModal(false);
      setPasswordForm(emptyPasswordForm);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <>
      <header className="border-b border-surface-border bg-white-A700 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <Logo className="h-8 w-8" />
            <div>
              <p className="font-poppins text-base font-bold leading-tight text-gray-800 dark:text-gray-100">
                Platform Admin
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Signed in as {user?.displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PasswordResetRequestsBadge />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
            >
              {theme === "dark" ? <HiOutlineSun className="text-lg" /> : <HiOutlineMoon className="text-lg" />}
            </button>
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              aria-label="Change password"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <HiOutlineKey className="text-lg" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger-600 transition-colors hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-500/10"
            >
              <HiOutlineArrowRightOnRectangle />
              Log out
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto whitespace-nowrap px-6 sm:px-4">
          {NAV_TABS.map(({ to, label, icon: Icon, end, countsUnreadTickets }) => (
            <NavLink key={to} to={to} end={end} className={tabClass}>
              <Icon className="text-base" />
              {label}
              {countsUnreadTickets && unreadTickets > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1 text-[11px] font-bold text-white-A700">
                  {unreadTickets}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <Modal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPasswordForm(emptyPasswordForm);
        }}
        title="Change Password"
      >
        <form className="space-y-4" onSubmit={handleChangePassword}>
          <div>
            <label className={labelClass}>Current password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>New password</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              className={inputClass}
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className={labelClass}>Confirm new password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={changingPassword}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {changingPassword ? "Changing…" : "Change Password"}
          </button>
        </form>
      </Modal>
    </>
  );
}
