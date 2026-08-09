import React, { useEffect, useState } from "react";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";
import ContactSelect from "./ContactSelect";
import { apiPost, apiPut } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

// Doubles as "Add Receivable" (no `entry`) and "Edit Receivable" (entry passed in) — the
// two forms are identical, only the submit target (POST vs PUT-by-id) and title differ.
const AddCreditModal = ({ isOpen, onClose, onAdded, entry }) => {
  const toast = useToast();
  const isEdit = !!entry;
  const [formData, setFormData] = useState({
    contact_id: "",
    amount_due: "",
    amount_received: "0",
  });

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      contact_id: entry ? String(entry.contact_id || "") : "",
      amount_due: entry ? String(entry.amount_due) : "",
      amount_received: entry ? String(entry.amount_received) : "0",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, entry]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.contact_id) {
      toast.error("Select a customer");
      return;
    }
    try {
      const payload = {
        contact_id: Number(formData.contact_id),
        amount_due: Number(formData.amount_due),
        amount_received: Number(formData.amount_received || 0),
      };
      if (isEdit) {
        await apiPut(`/api/credit/${entry.id}`, payload);
      } else {
        await apiPost("/credit", payload);
      }
      toast.success(isEdit ? "Receivable entry updated!" : "Receivable entry added!");
      onAdded();
      onClose();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? "Edit Receivable" : "Add Receivable (Customer)"}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <ContactSelect
          type="customer"
          id="credit_contact"
          value={formData.contact_id}
          onChange={(contact_id) => setFormData((prev) => ({ ...prev, contact_id }))}
        />
        <div>
          <label htmlFor="credit_amount_due" className={labelClass}>
            Amount Owed
          </label>
          <input
            type="number"
            name="amount_due"
            id="credit_amount_due"
            value={formData.amount_due}
            onChange={handleChange}
            className={inputClass}
            placeholder="Total owed by customer"
            required
            min="0"
          />
        </div>
        <div>
          <label htmlFor="credit_amount_received" className={labelClass}>
            Already Paid
          </label>
          <input
            type="number"
            name="amount_received"
            id="credit_amount_received"
            value={formData.amount_received}
            onChange={handleChange}
            className={inputClass}
            placeholder="0"
            min="0"
          />
        </div>
        <button
          type="submit"
          className="w-full text-white-A700 bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition-colors"
        >
          {isEdit ? "Save Changes" : "Add Entry"}
        </button>
      </form>
    </Modal>
  );
};

export default AddCreditModal;
