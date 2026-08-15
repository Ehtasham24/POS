import { useEffect, useState } from "react";
import { HiOutlineUsers, HiOutlinePlusCircle } from "react-icons/hi2";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { useAuth } from "auth/AuthContext";
import { apiGet, apiPost, apiPatch } from "utils/api";

// Owner-only self-serve account management — Settings itself is already an Owner-only
// route (App.jsx), so no extra gating needed here. No hard delete: deactivating (is_active)
// is enough and keeps sales.sold_by/voided_by referencing a real row (never destroying
// history is the same principle behind every other table this session touched).
export default function UsersCard() {
  const toast = useToast();
  const { t } = useLanguage();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", role: "cashier" });
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    try {
      setUsers(await apiGet("/api/users"));
    } catch (error) {
      toast.error(error.message);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPost("/api/users", form);
      toast.success(t("auth.userAdded"));
      setShowAdd(false);
      setForm({ username: "", password: "", displayName: "", role: "cashier" });
      fetchUsers();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await apiPatch(`/api/users/${u.id}`, { isActive: !u.isActive });
      fetchUsers();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="rounded-2xl border border-surface-border bg-white-A700 p-6 shadow-card dark:border-gray-800 dark:bg-gray-800">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
          <HiOutlineUsers className="text-xl text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                {t("auth.usersTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("auth.usersDesc")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700"
            >
              <HiOutlinePlusCircle className="text-base" />
              {t("auth.addUser")}
            </button>
          </div>

          <div className="mt-4 divide-y divide-surface-border rounded-xl border border-surface-border dark:divide-gray-700 dark:border-gray-700">
            {users === null ? (
              <p className="p-3 text-sm text-gray-500 dark:text-gray-400">{t("settings.loading")}</p>
            ) : (
              users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {u.displayName}
                      {u.id === currentUser?.id && (
                        <span className="ml-1.5 text-xs font-normal text-gray-400">({t("auth.you")})</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      @{u.username} ·{" "}
                      <span className="capitalize">
                        {u.role === "owner" ? t("auth.roleOwner") : t("auth.roleCashier")}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleActive(u)}
                    disabled={u.id === currentUser?.id}
                    title={u.id === currentUser?.id ? t("auth.cantDeactivateSelf") : ""}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      u.isActive
                        ? "bg-success-50 text-success-600 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-500"
                        : "bg-surface-muted text-gray-500 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {u.isActive ? t("auth.active") : t("auth.inactive")}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title={t("auth.addUser")}>
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.displayName")}
            </label>
            <input
              type="text"
              required
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.username")}
            </label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.password")}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.role")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {["cashier", "owner"].map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role }))}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-semibold capitalize transition-colors ${
                    form.role === role
                      ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400"
                      : "border-surface-border text-gray-600 hover:bg-surface-subtle dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {role === "owner" ? t("auth.roleOwner") : t("auth.roleCashier")}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-lg bg-surface-muted px-4 py-2 text-gray-800 transition-colors hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
            >
              {t("sell.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-white-A700 transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
