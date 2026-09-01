import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { HiOutlineSun, HiOutlineMoon } from "react-icons/hi2";
import Logo from "components/Logo";
import { useAuth } from "auth/AuthContext";
import useTheme from "hooks/useTheme";

// Deliberately plain English, not routed through i18n/translations.js — same reasoning as
// the rest of the admin console (pages/Admin/index.jsx's own top comment): this portal's
// only audience is the platform operator, never shop staff.
//
// A separate page from pages/Login (not a shared component with a mode flag) is the whole
// point — the two used to be one screen, and a request typed against "admin" on it once
// got self-approved and silently locked the platform admin out (see
// passwordResetService.js's role != 'superadmin' filter). No "Forgot password?" here at
// all: recovering a locked-out platform admin account is a DB-access-required operation
// (adminService.js's changeSuperAdminPassword comment), never a self-service request.
export default function AdminLoginPage() {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const loggedInUser = await login(username, password);
      if (loggedInUser.role !== "superadmin") {
        // Valid shop credentials, wrong portal — same enforcement pages/Login/index.jsx
        // does in reverse.
        await logout();
        setError("This is the admin portal. Shop staff sign in at the regular login.");
        return;
      }
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
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
          <h1 className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">Platform Admin</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Sign in to the admin console</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Username</label>
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
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Password</label>
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
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <Link
          to="/login"
          className="mt-4 block text-center text-xs text-gray-400 transition-colors hover:text-gray-600 hover:underline dark:text-gray-500 dark:hover:text-gray-300"
        >
          Not a platform admin? Shop login.
        </Link>
      </div>
    </div>
  );
}
