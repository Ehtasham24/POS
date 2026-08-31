import { useState } from "react";
import { HiOutlineSun, HiOutlineMoon } from "react-icons/hi2";
import Logo from "components/Logo";
import { useLanguage } from "i18n/LanguageContext";
import useTheme from "hooks/useTheme";
import { useAuth } from "auth/AuthContext";
import { apiPatch } from "utils/api";

// Landed on by ProtectedRoute whenever user.mustChangePassword is true (set by an admin
// -approved forgot-password request — see passwordResetService.js's approveRequest). Not
// wrapped in AppShell — same reasoning as the Login page itself: nothing else should be
// reachable until this is done.
export default function SetNewPasswordPage() {
  const { t } = useLanguage();
  const { checkSession } = useAuth();
  const [theme, toggleTheme] = useTheme();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError(t("auth.newPasswordMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      await apiPatch("/api/auth/set-new-password", { newPassword });
      // Re-fetches /api/auth/me so user.mustChangePassword flips to false in AuthContext —
      // ProtectedRoute then stops redirecting here and normal navigation resumes.
      await checkSession();
    } catch (err) {
      setError(err.message);
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
            {t("auth.setNewPasswordTitle")}
          </h1>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">{t("auth.setNewPasswordDesc")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.newPassword")}
            </label>
            <input
              type="password"
              required
              minLength={8}
              autoFocus
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.confirmNewPassword")}
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            disabled={submitting || !newPassword || !confirmPassword}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t("auth.setNewPasswordSubmitting") : t("auth.setNewPasswordSubmit")}
          </button>
        </form>
      </div>
    </div>
  );
}
