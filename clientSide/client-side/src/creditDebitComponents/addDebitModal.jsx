import React, { useState } from "react";
import { Modal } from "components";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

const AddDebitModal = ({ isOpen, onClose, onAdded }) => {
  const [formData, setFormData] = useState({
    name: "",
    amount_due: "",
    amount_received: "0",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("http://localhost:4000/debit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          amount_due: Number(formData.amount_due),
          amount_received: Number(formData.amount_received || 0),
        }),
      });
      if (!response.ok) throw new Error("Failed to add payable entry");
      alert("Payable entry added!");
      setFormData({ name: "", amount_due: "", amount_received: "0" });
      onAdded();
      onClose();
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Payable (Supplier)">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="debit_name" className={labelClass}>
            Supplier Name
          </label>
          <input
            type="text"
            name="name"
            id="debit_name"
            value={formData.name}
            onChange={handleChange}
            className={inputClass}
            placeholder="Enter supplier name"
            required
          />
        </div>
        <div>
          <label htmlFor="debit_amount_due" className={labelClass}>
            Amount Due
          </label>
          <input
            type="number"
            name="amount_due"
            id="debit_amount_due"
            value={formData.amount_due}
            onChange={handleChange}
            className={inputClass}
            placeholder="Total owed to supplier"
            required
            min="0"
          />
        </div>
        <div>
          <label htmlFor="debit_amount_received" className={labelClass}>
            Already Paid
          </label>
          <input
            type="number"
            name="amount_received"
            id="debit_amount_received"
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
          Add Entry
        </button>
      </form>
    </Modal>
  );
};

export default AddDebitModal;
