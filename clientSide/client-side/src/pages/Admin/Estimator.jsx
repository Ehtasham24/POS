import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { HiOutlineCalculator } from "react-icons/hi2";
import { useToast } from "components/Toast/ToastContext";
import { apiPost } from "utils/api";
import AdminHeader from "./AdminHeader";
import { inputClass, labelClass, formatBytes, USAGE_TABLE_LABEL, quotaBarColorClass, quotaTextColorClass } from "./shared";

const emptyForm = {
  numProducts: "",
  dailySalesLineItems: "",
  dailyStockAdjustments: "",
  numUsers: "",
  projectionMonths: "12",
};

// A standalone "what quota should I give this shop" calculator — checked BEFORE a shop
// exists, using nothing but a few numbers the client can describe about their own
// business. Deliberately NOT wired into New Shop/Edit Shop: the admin reads the
// recommendation here and types the resulting % into those forms themselves, since this is
// a projection (see storageEstimatorService.js for what's measured vs. assumed), not a
// value that should silently auto-fill a real shop's quota.
export default function EstimatorPage() {
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost("/api/admin/storage-estimate", {
        numProducts: form.numProducts,
        dailySalesLineItems: form.dailySalesLineItems,
        dailyStockAdjustments: form.dailyStockAdjustments || 0,
        numUsers: form.numUsers,
        projectionMonths: form.projectionMonths,
      });
      setResult(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-subtle dark:bg-gray-900">
      <Helmet>
        <title>Storage Estimator · Platform Admin</title>
      </Helmet>

      <AdminHeader />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5">
          <h1 className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">Storage Estimator</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Ask a client a few questions about their business, plug the numbers in here, and
            get a recommended storage quota % before you create their shop. Per-row sizes are
            measured live from this database's own real data, not guessed — see the note
            below the result for what's measured vs. assumed.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 md:grid-cols-1">
          <form
            onSubmit={handleSubmit}
            className="h-fit space-y-4 rounded-xl2 border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800"
          >
            <div>
              <label className={labelClass}>How many products will they stock?</label>
              <input
                type="number"
                required
                min={0}
                value={form.numProducts}
                onChange={handleChange("numProducts")}
                className={inputClass}
                placeholder="e.g. 200"
              />
            </div>
            <div>
              <label className={labelClass}>Roughly how many sale line-items per day?</label>
              <input
                type="number"
                required
                min={0}
                value={form.dailySalesLineItems}
                onChange={handleChange("dailySalesLineItems")}
                className={inputClass}
                placeholder="e.g. 50"
              />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Count each product sold, not each checkout — a 3-item sale is 3 line items.
              </p>
            </div>
            <div>
              <label className={labelClass}>Stock adjustments (damage/theft/count corrections) per day</label>
              <input
                type="number"
                min={0}
                value={form.dailyStockAdjustments}
                onChange={handleChange("dailyStockAdjustments")}
                className={inputClass}
                placeholder="e.g. 2 (optional, defaults to 0)"
              />
            </div>
            <div>
              <label className={labelClass}>How many staff accounts (owner + cashiers)?</label>
              <input
                type="number"
                required
                min={0}
                value={form.numUsers}
                onChange={handleChange("numUsers")}
                className={inputClass}
                placeholder="e.g. 3"
              />
            </div>
            <div>
              <label className={labelClass}>Project ahead how many months?</label>
              <input
                type="number"
                required
                min={1}
                value={form.projectionMonths}
                onChange={handleChange("projectionMonths")}
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HiOutlineCalculator />
              {loading ? "Calculating…" : "Calculate recommended quota"}
            </button>
          </form>

          <div className="space-y-4">
            {!result ? (
              <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl2 border border-dashed border-surface-border bg-surface-subtle p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400">
                Fill in the form and calculate to see a recommended quota.
              </div>
            ) : (
              <>
                <div className="rounded-xl2 border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Recommended quota
                  </p>
                  <p
                    className={`mt-1 font-poppins text-3xl font-bold ${quotaTextColorClass(
                      Math.min(result.recommendedPercent, 100)
                    )}`}
                  >
                    {result.recommendedPercent.toFixed(1)}%
                  </p>
                  <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-surface-muted dark:bg-gray-700">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${quotaBarColorClass(
                        Math.min(result.recommendedPercent, 100)
                      )}`}
                      style={{ width: `${Math.min(Math.max(result.recommendedPercent, 1.5), 100)}%` }}
                    />
                  </div>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                    {formatBytes(result.recommendedBytes)} of {formatBytes(result.totalDbCapacityBytes)} total
                    platform capacity.
                  </p>
                  {result.exceedsTotalCapacity && (
                    <p className="mt-2 rounded-lg bg-danger-50 px-3 py-2 text-xs font-medium text-danger-700 dark:bg-danger-500/10 dark:text-danger-400">
                      This exceeds the platform's entire current DB capacity — this client's
                      projected volume needs a bigger Supabase plan, not just a bigger slice
                      of the current one.
                    </p>
                  )}
                </div>

                <div className="rounded-xl2 border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
                  <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">How this was calculated</p>
                  <div className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
                    <div className="flex justify-between">
                      <span>Projected row content ({result.inputs.projectionMonths} months)</span>
                      <span className="font-medium">{formatBytes(result.projectedContentBytes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>× {result.overheadMultiplier} (index/overhead assumption)</span>
                      <span className="font-medium">{formatBytes(result.projectedRealBytes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>× {result.bufferMultiplier} (growth safety buffer)</span>
                      <span className="font-medium">{formatBytes(result.recommendedBytes)}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                    Row content and per-table sizes are measured live from this database's
                    own real data. The overhead and buffer multipliers are documented
                    assumptions, not measurements — see the table below for the per-table
                    detail.
                  </p>
                </div>

                <div className="overflow-hidden rounded-xl2 border border-surface-border bg-white-A700 shadow-card dark:border-gray-700 dark:bg-gray-800">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-surface-subtle dark:bg-gray-900/40">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600 dark:text-gray-300">Table</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600 dark:text-gray-300">Projected rows</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600 dark:text-gray-300">Bytes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                      {result.breakdown
                        .filter((row) => row.projectedRows > 0)
                        .sort((a, b) => b.bytes - a.bytes)
                        .map((row) => (
                          <tr key={row.table}>
                            <td className="px-4 py-2 text-gray-800 dark:text-gray-100">
                              {USAGE_TABLE_LABEL[row.table] || row.table}
                            </td>
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                              {row.projectedRows.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{formatBytes(row.bytes)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
