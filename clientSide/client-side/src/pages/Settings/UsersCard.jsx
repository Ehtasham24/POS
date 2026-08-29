import { useEffect, useState } from "react";
import { HiOutlineUsers, HiOutlinePlusCircle, HiOutlinePencil } from "react-icons/hi2";
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
  // Editing name/role/password of an existing account — separate from `form` (Add User)
  // since this one's password field means something different: blank = leave the current
  // password unchanged, not "required, 6+ chars" like a brand-new account.
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ displayName: "", role: "cashier", password: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Deactivated accounts don't count against the seat limit (see usersService.js's
  // createUser — same "deactivating, not deleting, is how an account goes away" reasoning
  // as everywhere else in this file), so this mirrors that exactly rather than just
  // users?.length, which would count them and disable the button too early.
  const activeCount = users?.filter((u) => u.isActive).length ?? 0;
  const maxUsers = currentUser?.shop?.maxUsers;
  const atUserLimit = maxUsers != null && activeCount >= maxUsers;

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

  const openEdit = (u) => {
    setEditTarget(u);
    setEditForm({ displayName: u.displayName, role: u.role, password: "" });
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      // Only send a password if one was actually typed — the backend leaves it unchanged
      // when the field is omitted (usersService.js's updateUser: `password ?? current`).
      const payload = { displayName: editForm.displayName, role: editForm.role };
      if (editForm.password) payload.password = editForm.password;
      await apiPatch(`/api/users/${editTarget.id}`, payload);
      toast.success(t("auth.userUpdated"));
      setEditTarget(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEditSaving(false);
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
              {maxUsers != null && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {t("auth.usersOfLimit", { count: activeCount, max: maxUsers })}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              disabled={atUserLimit}
              title={atUserLimit ? t("auth.userLimitReached", { max: maxUsers }) : ""}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary-600"
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
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      aria-label={t("common.edit")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      <HiOutlinePencil className="text-base" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(u)}
                      disabled={u.id === currentUser?.id}
                      title={u.id === currentUser?.id ? t("auth.cantDeactivateSelf") : ""}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        u.isActive
                          ? "bg-success-50 text-success-600 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-500"
                          : "bg-surface-muted text-gray-500 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-400"
                      }`}
                    >
                      {u.isActive ? t("auth.active") : t("auth.inactive")}
                    </button>
                  </div>
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

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={t("auth.editUser")}>
        <form onSubmit={handleEditSave} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.displayName")}
            </label>
            <input
              type="text"
              required
              value={editForm.displayName}
              onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
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
                  onClick={() => setEditForm((f) => ({ ...f, role }))}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-semibold capitalize transition-colors ${
                    editForm.role === role
                      ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400"
                      : "border-surface-border text-gray-600 hover:bg-surface-subtle dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {role === "owner" ? t("auth.roleOwner") : t("auth.roleCashier")}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("auth.newPasswordOptional")}
            </label>
            <input
              type="password"
              minLength={6}
              placeholder={t("auth.newPasswordPlaceholder")}
              value={editForm.password}
              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("auth.newPasswordHint")}</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              className="rounded-lg bg-surface-muted px-4 py-2 text-gray-800 transition-colors hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
            >
              {t("sell.cancel")}
            </button>
            <button
              type="submit"
              disabled={editSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-white-A700 transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {editSaving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
