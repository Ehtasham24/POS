import React, { useEffect, useState } from "react";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiPut } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

// Corrects one entry from a party's expanded history — amount/date/note only, not
// contact/direction/kind (see partyLedgerService.updateTransaction's comment: deliberately
// pragmatic for a single-owner shop, not fully immutable double-entry bookkeeping).
const EditTransactionModal = ({ isOpen, onClose, transaction, onUpdated }) => {
  const toast = useToast();
  const { t } = useLanguage();
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (isOpen && transaction) {
      setAmount(String(transaction.amount));
      setOccurredOn(String(transaction.occurred_on).slice(0, 10));
      setNote(transaction.note || "");
    }
  }, [isOpen, transaction]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiPut(`/api/parties/transactions/${transaction.id}`, {
        amount: Number(amount),
        occurredOn,
        note: note || undefined,
      });
      toast.success(t("creditDebit.entryUpdated"));
      onUpdated();
      onClose();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("common.edit")}>
      {transaction && (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="edit_tx_amount" className={labelClass}>
              {t("creditDebit.amount")}
            </label>
            <input
              type="number"
              id="edit_tx_amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
              min="0.01"
              step="0.01"
              required
            />
          </div>
          <div>
            <label htmlFor="edit_tx_date" className={labelClass}>
              {t("creditDebit.date")}
            </label>
            <input
              type="date"
              id="edit_tx_date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="edit_tx_note" className={labelClass}>
              {t("creditDebit.note")} ({t("creditDebit.optional")})
            </label>
            <input
              type="text"
              id="edit_tx_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            className="w-full text-white-A700 bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition-colors"
          >
            {t("creditDebit.saveChanges")}
          </button>
        </form>
      )}
    </Modal>
  );
};

export default EditTransactionModal;
