import React, { useEffect, useState } from "react";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { todayDateInputValue } from "./dateUtils";
import { apiPost } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

// For a party who's simultaneously owed money and owes money (e.g. a vendor you also
// returned stock to) — books the amount as settled on BOTH sides via
// POST /api/parties/net-off (see partyLedgerService.netOffParty), instead of moving real
// cash both ways. User-triggered only, never automatic.
const NetOffModal = ({ isOpen, onClose, entry, payableBalance, receivableBalance, onNetOff }) => {
  const toast = useToast();
  const { t } = useLanguage();
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayDateInputValue);
  const [note, setNote] = useState("");

  const maxNet = Math.min(Number(payableBalance) || 0, Number(receivableBalance) || 0);

  useEffect(() => {
    if (isOpen && entry) {
      setAmount(maxNet > 0 ? String(maxNet) : "");
      setOccurredOn(todayDateInputValue());
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, entry]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = Math.min(Number(amount), maxNet);
    if (amt <= 0) {
      toast.error(t("creditDebit.enterValidAmount"));
      return;
    }
    try {
      await apiPost("/api/parties/net-off", {
        contactId: entry.contact_id,
        amount: amt,
        occurredOn,
        note: note || undefined,
      });
      toast.success(t("creditDebit.netOffDone"));
      onNetOff();
      onClose();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${t("creditDebit.netOff")} — ${entry?.name || ""}`}>
      {entry && (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1 rounded-lg bg-surface-subtle p-3 text-sm dark:bg-gray-900/40">
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>{t("creditDebit.payableBalance")}</span>
              <span className="font-semibold text-gray-800 dark:text-gray-100">
                Rs.{Number(payableBalance).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>{t("creditDebit.receivableBalance")}</span>
              <span className="font-semibold text-gray-800 dark:text-gray-100">
                Rs.{Number(receivableBalance).toFixed(2)}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("creditDebit.netOffExplain")}</p>
          <div>
            <label htmlFor="netoff_amount" className={labelClass}>
              {t("creditDebit.amount")}
            </label>
            <input
              type="number"
              id="netoff_amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
              min="0.01"
              max={maxNet}
              step="0.01"
              autoFocus
              required
            />
          </div>
          <div>
            <label htmlFor="netoff_date" className={labelClass}>
              {t("creditDebit.date")}
            </label>
            <input
              type="date"
              id="netoff_date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="netoff_note" className={labelClass}>
              {t("creditDebit.note")} ({t("creditDebit.optional")})
            </label>
            <input
              type="text"
              id="netoff_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            className="w-full text-white-A700 bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition-colors"
          >
            {t("creditDebit.netOff")}
          </button>
        </form>
      )}
    </Modal>
  );
};

export default NetOffModal;
