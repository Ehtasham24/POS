import { useState } from "react";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { apiPost } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

// Opens a new shift (Sevices/shiftService.js's openShift) — same self-service action a
// cashier can take for themselves, or an owner for themselves too (they're just another
// staff member on the register). Rejected with a clean message if one is already open,
// mirroring the server's own 409 (migrations/017's partial unique index).
export default function OpenShiftModal({ isOpen, onClose, onOpened }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [openingFloat, setOpeningFloat] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const shift = await apiPost("/api/shifts", { openingFloat: Number(openingFloat) || 0 });
      toast.success(t("shifts.openShiftSuccess"));
      setOpeningFloat("");
      onOpened(shift);
    } catch (error) {
      toast.error(error.message || t("shifts.alreadyHaveOpenShift"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("shifts.openShift")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="opening_float" className={labelClass}>
            {t("shifts.openingFloat")}
          </label>
          <input
            type="number"
            id="opening_float"
            min="0"
            step="1"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            placeholder="0"
            className={inputClass}
            required
            autoFocus
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("shifts.openingFloatHint")}</p>
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
            {saving ? t("common.saving") : t("shifts.openShiftSubmit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
