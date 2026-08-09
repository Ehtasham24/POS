import React, { useState, useEffect } from "react";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";
import { apiPatch } from "utils/api";

const SettleModal = ({ isOpen, onClose, entry, type, onSettled }) => {
  const toast = useToast();
  const [amountPaid, setAmountPaid] = useState("");

  useEffect(() => {
    if (entry) {
      setAmountPaid(String(entry.amount_pending));
    }
  }, [entry]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const pending = Number(entry.amount_pending);
    const amount = Math.min(Number(amountPaid), pending);
    if (amount <= 0) {
      toast.error("Enter an amount greater than 0.");
      return;
    }
    try {
      await apiPatch(`/${type}/${entry.id}/settle`, { amountPaid: amount });
      toast.success("Entry settled successfully");
      onSettled();
      onClose();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Settle ${entry?.name || ""}`}>
      {entry && (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Pending amount: <span className="font-semibold text-gray-800 dark:text-gray-100">Rs.{Number(entry.amount_pending).toFixed(2)}</span>
          </p>
          <div>
            <label htmlFor="amount_paid" className="block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
              Amount Paid Now
            </label>
            <input
              type="number"
              id="amount_paid"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5"
              min="0"
              max={entry.amount_pending}
              step="0.01"
              autoFocus
              required
            />
          </div>
          <button
            type="submit"
            className="w-full text-white-A700 bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition-colors"
          >
            Settle
          </button>
        </form>
      )}
    </Modal>
  );
};

export default SettleModal;
