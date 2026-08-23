import { useEffect, useState } from "react";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { apiGet, apiPatch } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

// Closes an open shift (Sevices/shiftService.js's closeShift) — shows the live expected-cash
// figure (opening float + cash sales - cash refunds + cash movements, all scoped to this
// shift) so the cashier has something to count against before typing what's actually in the
// drawer. The real variance is computed and snapshotted server-side once submitted; nothing
// here is trusted client-side beyond the counted-cash input itself.
export default function CloseShiftModal({ isOpen, onClose, shiftId, onClosed }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [expectedCash, setExpectedCash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !shiftId) return;
    setLoading(true);
    apiGet(`/api/shifts/${shiftId}`)
      .then((detail) => setExpectedCash(Number(detail.expectedCashSoFar)))
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, shiftId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const shift = await apiPatch(`/api/shifts/${shiftId}/close`, {
        countedCash: Number(countedCash),
        notes: notes || undefined,
      });
      toast.success(t("shifts.closeShiftSuccess"));
      setCountedCash("");
      setNotes("");
      onClosed(shift);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("shifts.closeShift")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-xl border border-surface-border bg-surface-subtle p-3 dark:border-gray-700 dark:bg-gray-800/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("shifts.expectedCash")}
          </p>
          <p className="mt-1 font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">
            {loading ? "…" : `PKR ${expectedCash?.toFixed(0) ?? 0}`}
          </p>
        </div>
        <div>
          <label htmlFor="counted_cash" className={labelClass}>
            {t("shifts.countedCash")}
          </label>
          <input
            type="number"
            id="counted_cash"
            min="0"
            step="1"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            placeholder="0"
            className={inputClass}
            required
            autoFocus
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("shifts.countedCashHint")}</p>
        </div>
        <div>
          <label htmlFor="close_notes" className={labelClass}>
            {t("shifts.closeShiftNotes")}
          </label>
          <textarea
            id="close_notes"
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
            disabled={saving || loading}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("shifts.closeShiftSubmit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
