import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useNavigate } from "react-router-dom";
import { HiOutlinePlus, HiOutlineArrowRightOnRectangle, HiOutlineSun, HiOutlineMoon } from "react-icons/hi2";
import Logo from "components/Logo";
import { Modal, EmptyState, SkeletonRows } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useAuth } from "auth/AuthContext";
import useTheme from "hooks/useTheme";
import { apiGet, apiPost, apiPatch } from "utils/api";

// Deliberately plain English, not routed through i18n/translations.js like the rest of the
// app — this console's only ever audience is the platform operator (the POS provider
// running this), never shop staff, so the bilingual support that matters everywhere else in
// this codebase has no one to serve here.

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-1.5 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

const TIERS = ["basic", "smart", "advanced"];
const TIER_CHIP_CLASS = {
  basic: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  smart: "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400",
  advanced: "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
};

const emptyForm = { name: "", tier: "basic", ownerDisplayName: "", ownerUsername: "", ownerPassword: "" };

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  // This page has no AppShell/SidebarContent (the only other place useTheme() is currently
  // called) — without calling it here too, landing on /admin straight from login (no other
  // page mounted first) would never sync <html>'s "dark" class from localStorage at all.
  const [theme, toggleTheme] = useTheme();

  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  // Per-row in-flight state so a tier/active change on one shop doesn't visually block
  // every other row's controls while its own request is out.
  const [busyShopId, setBusyShopId] = useState(null);

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

  useEffect(() => {
    loadShops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

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

  return (
    <div className="min-h-screen bg-surface-subtle dark:bg-gray-900">
      <Helmet>
        <title>Platform Admin · POS System</title>
      </Helmet>

      <header className="flex items-center justify-between border-b border-surface-border bg-white-A700 px-6 py-3.5 dark:border-gray-700 dark:bg-gray-800">
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
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger-600 transition-colors hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-500/10"
          >
            <HiOutlineArrowRightOnRectangle />
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">Shops</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Every tenant on this database — create one, change its plan, or deactivate it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white-A700 transition-colors hover:bg-primary-700"
          >
            <HiOutlinePlus />
            New Shop
          </button>
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
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{shop.user_count}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {new Date(shop.created_at).toLocaleDateString()}
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
    </div>
  );
}
