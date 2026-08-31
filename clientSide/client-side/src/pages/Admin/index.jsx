import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { HiOutlinePlus, HiOutlinePencil, HiOutlineCircleStack, HiOutlineUser } from "react-icons/hi2";
import { Modal, EmptyState, SkeletonRows } from "components";
import { useToast } from "components/Toast/ToastContext";
import { apiGet, apiPost, apiPatch } from "utils/api";
import AdminHeader from "./AdminHeader";
import { inputClass, labelClass, TIERS, TIER_CHIP_CLASS, formatBytes } from "./shared";

// Deliberately plain English, not routed through i18n/translations.js like the rest of the
// app — this console's only ever audience is the platform operator (the POS provider
// running this), never shop staff, so the bilingual support that matters everywhere else in
// this codebase has no one to serve here.

const emptyForm = {
  name: "",
  tier: "basic",
  maxUsers: 5,
  ownerDisplayName: "",
  ownerUsername: "",
  ownerPassword: "",
};

export default function AdminDashboard() {
  const toast = useToast();

  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  // Per-row in-flight state so a tier/active change on one shop doesn't visually block
  // every other row's controls while its own request is out.
  const [busyShopId, setBusyShopId] = useState(null);
  // Editing an existing shop's name/seat limit — separate from `form` (New Shop) since
  // this one has no owner-account fields at all.
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", maxUsers: 5, storageQuotaPercent: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Owner Profile — a shop's owner identity (name/email/phone/CNIC), what a forgot
  // -password request gets checked against (see PasswordResetRequestsBadge.jsx).
  // Separate from editTarget/editForm above since this edits a `users` row, not `shops`.
  const [ownerTarget, setOwnerTarget] = useState(null);
  const [ownerForm, setOwnerForm] = useState({ displayName: "", email: "", phone: "", cnic: "" });
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [ownerSaving, setOwnerSaving] = useState(false);

  // Platform Settings: the one number every shop's quota percentage is actually relative
  // to — see migration 025. Supabase has no queryable "what plan are we on" from inside
  // this app, so this is admin-entered based on their real plan.
  const [platformSettings, setPlatformSettings] = useState(null);
  const [showPlatformSettings, setShowPlatformSettings] = useState(false);
  const [capacityForm, setCapacityForm] = useState({ mode: "preset", presetBytes: "", customGB: "" });
  const [savingCapacity, setSavingCapacity] = useState(false);

  const loadShops = async () => {
    setLoading(true);
    try {
      setShops(await apiGet("/api/admin/shops"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPlatformSettings = async () => {
    try {
      setPlatformSettings(await apiGet("/api/admin/platform-settings"));
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    loadShops();
    loadPlatformSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiPost("/api/admin/shops", form);
      toast.success(`Shop "${form.name}" created.`);
      setShowCreate(false);
      setForm(emptyForm);
      loadShops();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleTierChange = async (shop, newTier) => {
    if (newTier === shop.tier) return;
    setBusyShopId(shop.id);
    try {
      const { automations } = await apiPatch(`/api/admin/shops/${shop.id}/tier`, { tier: newTier });
      const notes = [];
      if (automations.shiftsClosed > 0) notes.push(`${automations.shiftsClosed} open shift(s) auto-closed`);
      if (automations.productsFlattened > 0) notes.push(`${automations.productsFlattened} batch product(s) flattened`);
      toast.success(
        `${shop.name}: ${shop.tier} → ${newTier}` + (notes.length ? ` (${notes.join(", ")})` : "")
      );
      loadShops();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyShopId(null);
    }
  };

  const handleActiveToggle = async (shop) => {
    setBusyShopId(shop.id);
    try {
      await apiPatch(`/api/admin/shops/${shop.id}/active`, { isActive: !shop.is_active });
      toast.success(`${shop.name} ${shop.is_active ? "deactivated" : "activated"}.`);
      loadShops();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyShopId(null);
    }
  };

  const openEdit = (shop) => {
    setEditTarget(shop);
    setEditForm({
      name: shop.name,
      maxUsers: shop.max_users,
      // A percentage of the platform's total DB capacity (see Platform Settings below), not
      // an absolute number — blank means "no quota configured," not 0.
      storageQuotaPercent: shop.storage_quota_percent ?? "",
    });
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      const storageQuotaPercent =
        editForm.storageQuotaPercent === "" ? null : Number(editForm.storageQuotaPercent);
      await apiPatch(`/api/admin/shops/${editTarget.id}`, {
        name: editForm.name,
        maxUsers: editForm.maxUsers,
        storageQuotaPercent,
      });
      toast.success(`${editTarget.name} updated.`);
      setEditTarget(null);
      loadShops();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const openOwnerProfile = async (shop) => {
    setOwnerTarget(shop);
    setOwnerLoading(true);
    try {
      const owner = await apiGet(`/api/admin/shops/${shop.id}/owner`);
      setOwnerForm({
        displayName: owner.displayName,
        email: owner.email || "",
        phone: owner.phone || "",
        cnic: owner.cnic || "",
      });
    } catch (err) {
      toast.error(err.message);
      setOwnerTarget(null);
    } finally {
      setOwnerLoading(false);
    }
  };

  const handleOwnerSave = async (e) => {
    e.preventDefault();
    setOwnerSaving(true);
    try {
      await apiPatch(`/api/admin/shops/${ownerTarget.id}/owner`, {
        displayName: ownerForm.displayName,
        email: ownerForm.email || null,
        phone: ownerForm.phone || null,
        cnic: ownerForm.cnic || null,
      });
      toast.success(`${ownerTarget.name}'s owner profile updated.`);
      setOwnerTarget(null);
      loadShops();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setOwnerSaving(false);
    }
  };

  const openPlatformSettings = () => {
    const current = platformSettings?.totalDbCapacityBytes;
    const matchesPreset = platformSettings?.presets?.find((p) => p.bytes === current);
    setCapacityForm(
      matchesPreset
        ? { mode: "preset", presetBytes: String(matchesPreset.bytes), customGB: "" }
        : { mode: "custom", presetBytes: "", customGB: current ? current / 1024 ** 3 : "" }
    );
    setShowPlatformSettings(true);
  };

  const handleSaveCapacity = async (e) => {
    e.preventDefault();
    setSavingCapacity(true);
    try {
      const totalDbCapacityBytes =
        capacityForm.mode === "preset"
          ? Number(capacityForm.presetBytes)
          : Math.round(Number(capacityForm.customGB) * 1024 ** 3);
      await apiPatch("/api/admin/platform-settings", { totalDbCapacityBytes });
      toast.success("Total DB capacity updated — every shop's quota % now reflects it.");
      setShowPlatformSettings(false);
      loadPlatformSettings();
      loadShops();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingCapacity(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-subtle dark:bg-gray-900">
      <Helmet>
        <title>Platform Admin · POS System</title>
      </Helmet>

      <AdminHeader />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">Shops</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Every tenant on this database — create one, change its plan, or deactivate it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openPlatformSettings}
              className="flex items-center gap-1.5 rounded-lg border border-surface-border px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-muted dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <HiOutlineCircleStack />
              {platformSettings ? `${formatBytes(platformSettings.totalDbCapacityBytes)} total` : "Platform Settings"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white-A700 transition-colors hover:bg-primary-700"
            >
              <HiOutlinePlus />
              New Shop
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl2 border border-surface-border bg-white-A700 shadow-card dark:border-gray-700 dark:bg-gray-800">
          {loading ? (
            <SkeletonRows count={4} />
          ) : shops.length === 0 ? (
            <EmptyState title='No shops yet — click "New Shop" to onboard the first one.' />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface-subtle dark:bg-gray-900/40">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Shop</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Tier</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Users</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                {shops.map((shop) => (
                  <tr key={shop.id} className={busyShopId === shop.id ? "opacity-50" : ""}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 dark:text-gray-100">{shop.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{shop.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={shop.tier}
                        disabled={busyShopId === shop.id}
                        onChange={(e) => handleTierChange(shop, e.target.value)}
                        className={`rounded-md border-0 py-1 pl-2 pr-7 text-xs font-semibold capitalize focus:ring-2 focus:ring-primary-500 ${TIER_CHIP_CLASS[shop.tier]}`}
                      >
                        {TIERS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyShopId === shop.id}
                        onClick={() => handleActiveToggle(shop)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                          shop.is_active
                            ? "bg-success-50 text-success-600 hover:bg-success-500/20 dark:bg-success-500/10 dark:text-success-500"
                            : "bg-danger-50 text-danger-600 hover:bg-danger-500/20 dark:bg-danger-500/10 dark:text-danger-400"
                        }`}
                      >
                        {shop.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {shop.user_count} / {shop.max_users}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {new Date(shop.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openOwnerProfile(shop)}
                        aria-label={`Owner profile for ${shop.name}`}
                        title="Owner profile"
                        className="mr-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
                      >
                        <HiOutlineUser className="text-base" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(shop)}
                        aria-label={`Edit ${shop.name}`}
                        title="Edit shop"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
                      >
                        <HiOutlinePencil className="text-base" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Shop">
        <form className="space-y-4" onSubmit={handleCreate}>
          <div>
            <label className={labelClass}>Shop name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className={inputClass}
              placeholder="e.g. Ali General Store"
            />
          </div>
          <div>
            <label className={labelClass}>Tier</label>
            <select
              value={form.tier}
              onChange={(e) => setForm((prev) => ({ ...prev, tier: e.target.value }))}
              className={inputClass}
            >
              {TIERS.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Max users</label>
            <input
              type="number"
              required
              min={1}
              step={1}
              value={form.maxUsers}
              onChange={(e) => setForm((prev) => ({ ...prev, maxUsers: e.target.value }))}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              How many staff accounts this shop can have at once (only matters once its tier
              includes multi-user — Smart and up).
            </p>
          </div>
          <div className="border-t border-surface-border pt-4 dark:border-gray-700">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              First owner login
            </p>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Owner display name</label>
                <input
                  type="text"
                  value={form.ownerDisplayName}
                  onChange={(e) => setForm((prev) => ({ ...prev, ownerDisplayName: e.target.value }))}
                  className={inputClass}
                  placeholder="Optional — defaults to the username"
                />
              </div>
              <div>
                <label className={labelClass}>Owner username</label>
                <input
                  type="text"
                  required
                  value={form.ownerUsername}
                  onChange={(e) => setForm((prev) => ({ ...prev, ownerUsername: e.target.value }))}
                  className={inputClass}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className={labelClass}>Owner password</label>
                <input
                  type="text"
                  required
                  minLength={8}
                  value={form.ownerPassword}
                  onChange={(e) => setForm((prev) => ({ ...prev, ownerPassword: e.target.value }))}
                  className={inputClass}
                  autoComplete="off"
                  placeholder="At least 8 characters"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Shown as plain text here only because you're the one setting it — pass it to
                  the shop owner directly, it isn't stored or shown again after this.
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Shop"}
          </button>
        </form>
      </Modal>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Shop">
        <form className="space-y-4" onSubmit={handleEditSave}>
          <div>
            <label className={labelClass}>Shop name</label>
            <input
              type="text"
              required
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Max users</label>
            <input
              type="number"
              required
              min={1}
              step={1}
              value={editForm.maxUsers}
              onChange={(e) => setEditForm((prev) => ({ ...prev, maxUsers: e.target.value }))}
              className={inputClass}
            />
            {editTarget && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Currently {editTarget.user_count} active user(s). Can't go below that.
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Storage quota (% of total DB)</label>
            <input
              type="number"
              min={0.01}
              max={100}
              step="any"
              value={editForm.storageQuotaPercent}
              onChange={(e) => setEditForm((prev) => ({ ...prev, storageQuotaPercent: e.target.value }))}
              className={inputClass}
              placeholder="Leave blank for no quota / unlimited"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              A share of the platform's total DB capacity (currently{" "}
              {platformSettings ? formatBytes(platformSettings.totalDbCapacityBytes) : "…"} — see the
              Platform Settings button above), not a fixed number — upgrading the total capacity
              later rescales this automatically. At 75% of its own allotment, the shop's dashboard
              starts showing a glowing warning icon. See the Usage tab for exactly how close each
              shop is.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              className="rounded-lg bg-surface-muted px-4 py-2 text-sm text-gray-800 transition-colors hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!ownerTarget}
        onClose={() => setOwnerTarget(null)}
        title={ownerTarget ? `${ownerTarget.name} — Owner Profile` : "Owner Profile"}
      >
        {ownerLoading ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : (
          <form className="space-y-4" onSubmit={handleOwnerSave}>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This is what a forgot-password request gets checked against — see the key icon
              in the header once an owner submits one. Username and password aren't editable
              here; password resets go through that same request flow.
            </p>
            <div>
              <label className={labelClass}>Owner name</label>
              <input
                type="text"
                required
                value={ownerForm.displayName}
                onChange={(e) => setOwnerForm((prev) => ({ ...prev, displayName: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={ownerForm.email}
                onChange={(e) => setOwnerForm((prev) => ({ ...prev, email: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input
                type="tel"
                value={ownerForm.phone}
                onChange={(e) => setOwnerForm((prev) => ({ ...prev, phone: e.target.value }))}
                className={inputClass}
                placeholder="03XXXXXXXXX"
              />
            </div>
            <div>
              <label className={labelClass}>CNIC</label>
              <input
                type="text"
                value={ownerForm.cnic}
                onChange={(e) => setOwnerForm((prev) => ({ ...prev, cnic: e.target.value }))}
                className={inputClass}
                placeholder="XXXXX-XXXXXXX-X"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Must be unique across shops — this is what most reliably tells two owners apart.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setOwnerTarget(null)}
                className="rounded-lg bg-surface-muted px-4 py-2 text-sm text-gray-800 transition-colors hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={ownerSaving}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ownerSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={showPlatformSettings} onClose={() => setShowPlatformSettings(false)} title="Platform Settings">
        <form className="space-y-4" onSubmit={handleSaveCapacity}>
          <div>
            <p className={labelClass}>Total DB capacity</p>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              How big your Supabase database is actually allowed to get, per your real plan.
              Supabase doesn't expose this to a query run from inside the app — this is you
              telling the system what your plan actually is. Every shop's quota is a
              <strong> percentage</strong> of this number, so changing it here instantly
              rescales every shop's effective quota, with nothing to update per-shop.
            </p>
            <div className="space-y-2">
              {platformSettings?.presets?.map((preset) => (
                <label
                  key={preset.bytes}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    capacityForm.mode === "preset" && Number(capacityForm.presetBytes) === preset.bytes
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-500/10"
                      : "border-surface-border hover:bg-surface-subtle dark:border-gray-700 dark:hover:bg-gray-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="capacityPreset"
                    checked={capacityForm.mode === "preset" && Number(capacityForm.presetBytes) === preset.bytes}
                    onChange={() => setCapacityForm({ mode: "preset", presetBytes: String(preset.bytes), customGB: "" })}
                  />
                  <span className="text-gray-800 dark:text-gray-100">{preset.label}</span>
                </label>
              ))}
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  capacityForm.mode === "custom"
                    ? "border-primary-500 bg-primary-50 dark:bg-primary-500/10"
                    : "border-surface-border hover:bg-surface-subtle dark:border-gray-700 dark:hover:bg-gray-700"
                }`}
              >
                <input
                  type="radio"
                  name="capacityPreset"
                  checked={capacityForm.mode === "custom"}
                  onChange={() => setCapacityForm((prev) => ({ ...prev, mode: "custom" }))}
                />
                <span className="flex-1 text-gray-800 dark:text-gray-100">Custom (GB)</span>
                {capacityForm.mode === "custom" && (
                  <input
                    type="number"
                    min={0.001}
                    step="any"
                    required
                    autoFocus
                    value={capacityForm.customGB}
                    onChange={(e) => setCapacityForm((prev) => ({ ...prev, customGB: e.target.value }))}
                    onClick={(e) => e.stopPropagation()}
                    className="w-28 rounded-lg border border-surface-border bg-white-A700 p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                )}
              </label>
            </div>
          </div>
          <button
            type="submit"
            disabled={savingCapacity}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingCapacity ? "Saving…" : "Save"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
