import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { HiOutlineSun, HiOutlineMoon } from "react-icons/hi2";
import Logo from "components/Logo";
import { useAuth } from "auth/AuthContext";
import { useLanguage } from "i18n/LanguageContext";
import useTheme from "hooks/useTheme";
import ForgotPasswordModal from "./ForgotPasswordModal";
import useDeviceStatus from "hooks/useDeviceStatus";

// Deliberately not wrapped in AppShell — no sidebar/nav makes sense before there's a
// logged-in user to show them for. Shop staff only (owner/cashier) — a platform superadmin
// has its own separate portal at /admin/login (pages/AdminLogin), so a superadmin
// account logging in here is rejected rather than silently let through. That separation is
// deliberate, not cosmetic: it's what keeps "Forgot password?" below scoped to shop
// accounts only — see passwordResetService.js's role != 'superadmin' filter, and the
// incident that motivated it (a request submitted against "admin" here got self-approved
// and silently locked the platform admin out).
export default function LoginPage() {
  const { login, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  // Called here too (not just from AppShell/the Admin dashboard) — this is the very first
  // page anyone sees, logged in or not, so it needs its own sync of <html>'s "dark" class
  // from localStorage rather than relying on some other, later-mounted page to have done it.
  const [theme, toggleTheme] = useTheme();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  // On a shop's own device: send it to first-run setup until it has a shop, and hide the
  // cloud-only links (password reset requests and the platform admin live in the cloud).
  const deviceStatus = useDeviceStatus();
  useEffect(() => {
    if (deviceStatus?.device && !deviceStatus.setUp) navigate("/device-setup", { replace: true });
  }, [deviceStatus, navigate]);
  const onDevice = Boolean(deviceStatus?.device);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const loggedInUser = await login(username, password);
      if (loggedInUser.role === "superadmin") {
        // Valid credentials, wrong portal — log the session right back out rather than
        // continue into a mismatched app the way the shared-login page used to.
        await logout();
        setError("This is the shop login. Platform admins sign in at the admin portal.");
        return;
      }
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setError(err.message || t("auth.loginError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-surface-subtle px-4 dark:bg-gray-900">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
      >
        {theme === "dark" ? <HiOutlineSun className="text-lg" /> : <HiOutlineMoon className="text-lg" />}
      </button>
      <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-white-A700 p-8 shadow-card dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Logo className="h-12 w-12" />
          <h1 className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">
            {t("auth.title")}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.username")}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600 dark:bg-danger-500/10 dark:text-danger-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t("auth.loggingIn") : t("auth.login")}
          </button>

          {!onDevice && (
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="block w-full text-center text-sm font-medium text-primary-600 transition-colors hover:underline dark:text-primary-400"
            >
              {t("auth.forgotPassword")}
            </button>
          )}
        </form>

        {!onDevice && (
          <Link
            to="/admin/login"
            className="mt-4 block text-center text-xs text-gray-400 transition-colors hover:text-gray-600 hover:underline dark:text-gray-500 dark:hover:text-gray-300"
          >
            Platform admin? Sign in here.
          </Link>
        )}
      </div>

      <ForgotPasswordModal isOpen={showForgotPassword} onClose={() => setShowForgotPassword(false)} />
    </div>
  );
}
