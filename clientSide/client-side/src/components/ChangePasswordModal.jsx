import { useState } from "react";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { apiPatch } from "utils/api";

const inputClass =
  "block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";
const labelClass = "mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400";

// Changing your own password (the account menu). The current one is asked first. On a register
// this goes to the cloud and the new password comes back down at once (device/readThrough.js),
// so it works offline afterwards too; without the internet it says so.
export default function ChangePasswordModal({ onClose }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.newPassword !== form.confirm) return setError(t("auth.newPasswordMismatch"));
    setSaving(true);
    try {
      await apiPatch("/api/auth/password", { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success(t("auth.passwordChanged"));
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const field = (name, label, props) => (
    <div>
      <label htmlFor={`pw_${name}`} className={labelClass}>
        {label}
      </label>
      <input id={`pw_${name}`} type="password" required value={form[name]} onChange={set(name)} className={inputClass} {...props} />
    </div>
  );

  return (
    <Modal isOpen onClose={onClose} title={t("auth.changePassword")} maxWidth="max-w-sm">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {field("currentPassword", t("auth.currentPassword"), { autoFocus: true, autoComplete: "current-password" })}
        {field("newPassword", t("auth.newPassword"), { minLength: 8, autoComplete: "new-password", placeholder: t("auth.passwordMinLength") })}
        {field("confirm", t("auth.confirmNewPassword"), { minLength: 8, autoComplete: "new-password" })}
        {error && <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600 dark:bg-danger-500/10 dark:text-danger-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-muted px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving || !form.currentPassword || form.newPassword.length < 8 || !form.confirm}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t("auth.setNewPasswordSubmitting") : t("auth.changePassword")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
