import { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineSun,
  HiOutlineMoon,
  HiOutlineKey,
  HiOutlineBuildingStorefront,
  HiOutlineChartBar,
} from "react-icons/hi2";
import Logo from "components/Logo";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useAuth } from "auth/AuthContext";
import useTheme from "hooks/useTheme";
import { apiPatch } from "utils/api";
import { inputClass, labelClass } from "./shared";

const emptyPasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

const NAV_TABS = [
  { to: "/admin", label: "Shops", icon: HiOutlineBuildingStorefront, end: true },
  { to: "/admin/usage", label: "Usage", icon: HiOutlineChartBar, end: false },
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
export default function AdminHeader() {
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
    navigate("/login", { replace: true });
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
        <nav className="flex gap-1 px-6">
          {NAV_TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={tabClass}>
              <Icon className="text-base" />
              {label}
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
