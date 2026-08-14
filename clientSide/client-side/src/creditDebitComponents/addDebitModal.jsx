import React, { useEffect, useState } from "react";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import ContactSelect from "./ContactSelect";
import { todayDateInputValue } from "./dateUtils";
import { apiPost } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

const initialFormData = () => ({
  contact_id: "",
  amount: "",
  occurredOn: todayDateInputValue(),
  note: "",
});

// Records a new "we bought on credit from a supplier" entry — one row in the append-only
// party ledger (see ExpressBackend/migrations/005_party_ledger.sql), not an editable
// running total. Correcting a past entry happens from the party's expanded history row.
const AddDebitModal = ({ isOpen, onClose, onAdded }) => {
  const toast = useToast();
  const { t } = useLanguage();
  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    if (isOpen) setFormData(initialFormData());
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.contact_id) {
      toast.error(t("creditDebit.selectVendor"));
      return;
    }
    try {
      await apiPost("/api/parties/transactions", {
        contactId: Number(formData.contact_id),
        direction: "payable",
        kind: "charge",
        amount: Number(formData.amount),
        occurredOn: formData.occurredOn,
        note: formData.note || undefined,
      });
      toast.success(t("creditDebit.entryAdded"));
      onAdded();
      onClose();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("creditDebit.addPayable")}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <ContactSelect
          type="vendor"
          id="debit_contact"
          value={formData.contact_id}
          onChange={(contact_id) => setFormData((prev) => ({ ...prev, contact_id }))}
        />
        <div>
          <label htmlFor="debit_amount" className={labelClass}>
            {t("creditDebit.amount")}
          </label>
          <input
            type="number"
            name="amount"
            id="debit_amount"
            value={formData.amount}
            onChange={handleChange}
            className={inputClass}
            placeholder="0"
            required
            min="0.01"
            step="0.01"
          />
        </div>
        <div>
          <label htmlFor="debit_date" className={labelClass}>
            {t("creditDebit.date")}
          </label>
          <input
            type="date"
            name="occurredOn"
            id="debit_date"
            value={formData.occurredOn}
            onChange={handleChange}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="debit_note" className={labelClass}>
            {t("creditDebit.note")} ({t("creditDebit.optional")})
          </label>
          <input
            type="text"
            name="note"
            id="debit_note"
            value={formData.note}
            onChange={handleChange}
            className={inputClass}
            placeholder="e.g. 50 units stock"
          />
        </div>
        <button
          type="submit"
          className="w-full text-white-A700 bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition-colors"
        >
          {t("creditDebit.addEntry")}
        </button>
      </form>
    </Modal>
  );
};

export default AddDebitModal;
