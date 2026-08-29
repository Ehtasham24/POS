import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Logo from "components/Logo";
import { useAuth } from "auth/AuthContext";
import { useLanguage } from "i18n/LanguageContext";

// Deliberately not wrapped in AppShell — no sidebar/nav makes sense before there's a
// logged-in user to show them for.
export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

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
      // A superadmin (migration 022) has no shop, so "home" is always the admin console —
      // never location.state?.from, which could be a shop-scoped URL left over from a
      // completely different account's session on this browser (ProtectedRoute would just
      // bounce them straight back out of it anyway, but there's no reason to round-trip
      // through that). Everyone else keeps the normal "back to wherever you were headed"
      // behavior, falling back to the selling screen.
      const home =
        loggedInUser.role === "superadmin" ? "/admin" : location.state?.from || "/";
      navigate(home, { replace: true });
    } catch (err) {
      setError(err.message || t("auth.loginError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4 dark:bg-gray-900">
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
        </form>
      </div>
    </div>
  );
}
