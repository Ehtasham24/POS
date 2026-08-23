import { useState } from "react";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { apiPost } from "utils/api";
import ContactSelect from "creditDebitComponents/ContactSelect";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

// Records cash added to or removed from an open shift's drawer that isn't a sale/refund —
// owner topping up the float, or taking cash out to pay a supplier (Sevices/shiftService.js's
// recordCashMovement). contactId is optional and reuses the same vendor picker Credit/Debit
// already has (creditDebitComponents/ContactSelect.jsx) — only worth linking when the
// movement genuinely is a supplier payment.
export default function CashMovementModal({ isOpen, onClose, shiftId, onRecorded }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [linkContact, setLinkContact] = useState(false);
  const [contactId, setContactId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPost(`/api/shifts/${shiftId}/cash-movement`, {
        amount: Number(amount),
        reason,
        contactId: linkContact && contactId ? contactId : undefined,
      });
      toast.success(t("shifts.cashMovementSuccess"));
      setAmount("");
      setReason("");
      setLinkContact(false);
      setContactId("");
      onRecorded();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("shifts.recordCashMovement")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="movement_amount" className={labelClass}>
            {t("shifts.cashMovementAmount")}
          </label>
          <input
            type="number"
            id="movement_amount"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={inputClass}
            required
            autoFocus
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("shifts.cashMovementAmountHint")}</p>
        </div>
        <div>
          <label htmlFor="movement_reason" className={labelClass}>
            {t("shifts.cashMovementReason")}
          </label>
          <input
            type="text"
            id="movement_reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={linkContact}
            onChange={(e) => setLinkContact(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border text-primary-600 focus:ring-primary-500"
          />
          {t("shifts.cashMovementContact")}
        </label>
        {linkContact && <ContactSelect type="vendor" value={contactId} onChange={setContactId} id="movement_contact" />}
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
            {saving ? t("common.saving") : t("shifts.cashMovementSubmit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
