import { useState } from "react";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { apiPost } from "utils/api";

const emptyForm = { username: "", cnic: "", phone: "" };

// Public flow — no session exists yet, this IS the "I can't log in" path. Submits to
// POST /api/auth/forgot-password (no requireAuth), which always responds with the same
// neutral message regardless of whether the username matched anything (anti-enumeration,
// mirroring how the login form itself never distinguishes "no such user" from "wrong
// password" — see ExpressBackend's authService.js). The actual review/approve happens on
// the admin side (PasswordResetRequestsBadge), never here.
export default function ForgotPasswordModal({ isOpen, onClose }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const close = () => {
    onClose();
    setForm(emptyForm);
    setError("");
    setSuccessMessage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.cnic.trim() && !form.phone.trim()) {
      setError(t("auth.forgotPasswordIdentityHint"));
      return;
    }
    setSubmitting(true);
    try {
      await apiPost("/api/auth/forgot-password", {
        username: form.username.trim(),
        claimedCnic: form.cnic.trim() || undefined,
        claimedPhone: form.phone.trim() || undefined,
      });
      setSuccessMessage(t("auth.forgotPasswordSuccess"));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={t("auth.forgotPasswordTitle")}>
      {successMessage ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
            {successMessage}
          </p>
          <button
            type="button"
            onClick={close}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700"
          >
            {t("auth.login")}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("auth.forgotPasswordDesc")}</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.username")}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.forgotPasswordCnic")}
            </label>
            <input
              type="text"
              value={form.cnic}
              onChange={(e) => setForm((prev) => ({ ...prev, cnic: e.target.value }))}
              placeholder="XXXXX-XXXXXXX-X"
              className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.forgotPasswordPhone")}
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="03XXXXXXXXX"
              className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">{t("auth.forgotPasswordIdentityHint")}</p>

          {error && (
            <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600 dark:bg-danger-500/10 dark:text-danger-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !form.username.trim()}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t("auth.forgotPasswordSubmitting") : t("auth.forgotPasswordSubmit")}
          </button>
        </form>
      )}
    </Modal>
  );
}
