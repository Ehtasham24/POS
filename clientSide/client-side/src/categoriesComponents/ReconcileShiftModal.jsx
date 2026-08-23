import { useState } from "react";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { apiPatch } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

// Finalizes a shift the auto-close sweep already closed with no drawer count (Sevices/
// shiftService.js's reconcileShift) — whoever eventually gets to the actual drawer records
// what was really there. expected_cash is already fixed on the shift row itself (computed at
// auto-close time), unlike CloseShiftModal there's no live figure to poll for.
export default function ReconcileShiftModal({ isOpen, onClose, shift, onReconciled }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPatch(`/api/shifts/${shift.id}/reconcile`, {
        countedCash: Number(countedCash),
        notes: notes || undefined,
      });
      toast.success(t("shifts.reconcileSuccess"));
      setCountedCash("");
      setNotes("");
      onReconciled();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!shift) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("shifts.reconcile")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
          {t("shifts.autoClosedExplanation")}
        </div>
        <div className="rounded-xl border border-surface-border bg-surface-subtle p-3 dark:border-gray-700 dark:bg-gray-800/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("shifts.expectedCash")}
          </p>
          <p className="mt-1 font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">
            PKR {Number(shift.expected_cash).toFixed(0)}
          </p>
        </div>
        <div>
          <label htmlFor="reconcile_counted_cash" className={labelClass}>
            {t("shifts.countedCash")}
          </label>
          <input
            type="number"
            id="reconcile_counted_cash"
            min="0"
            step="1"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            placeholder="0"
            className={inputClass}
            required
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="reconcile_notes" className={labelClass}>
            {t("shifts.closeShiftNotes")}
          </label>
          <textarea
            id="reconcile_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </div>
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
            disabled={saving}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("shifts.reconcileSubmit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
