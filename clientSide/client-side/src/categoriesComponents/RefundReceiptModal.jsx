import { useState } from "react";
import { HiOutlinePrinter, HiOutlineCheckCircle } from "react-icons/hi2";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { printRefundReceipt } from "utils/printReceipt";

// Shown right after a refund is confirmed — mirrors ReceiptPreviewModal's Done/Print pattern
// for the original sale receipt. The refund itself is already saved by the time this opens
// (Sevices/salesService.js's refundSale already committed), so this is purely an in-app
// "want a printed copy for the customer?" prompt, same as the sale-receipt flow.
export default function RefundReceiptModal({ isOpen, onClose, refund }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [printing, setPrinting] = useState(false);

  if (!refund) return null;

  const { productname, quantity, amount, refundMethod, condition, reason, refundNo, receiptNo } = refund;
  const methodLabel = { cash: "Cash", card: "Card", store_credit: "Store Credit" }[refundMethod] || refundMethod;

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printRefundReceipt(refund);
    } catch (error) {
      console.error("Error printing refund slip:", error);
      toast.error(t("receipt.printError"));
    } finally {
      setPrinting(false);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("salesHistory.refundSlipTitle")} maxWidth="max-w-sm">
      <div className="rounded-xl border border-dashed border-surface-border bg-surface-subtle p-4 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-100">
        <div className="text-center">
          <p className="mt-1 font-bold">{t("salesHistory.refundSlipTitle").toUpperCase()}</p>
        </div>

        <p className="mt-2">{t("salesHistory.refundNo")}: {refundNo}</p>
        {receiptNo && <p>{t("salesHistory.receiptNo")}: {receiptNo}</p>}
        <p>{new Date().toLocaleString()}</p>
        <div className="my-2 border-t border-dashed border-gray-400 dark:border-gray-600" />

        <p className="font-bold">{productname}</p>
        <div className="mt-1 space-y-0.5">
          <div className="flex justify-between">
            <span>{t("salesHistory.refundQuantity")}</span>
            <span>{quantity}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("salesHistory.refundCondition")}</span>
            <span>{condition === "damaged" ? t("salesHistory.conditionDamaged") : t("salesHistory.conditionResellable")}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("salesHistory.refundMethod")}</span>
            <span>{methodLabel}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="shrink-0">{t("salesHistory.refundReasonLabel")}</span>
            <span className="text-right">{reason}</span>
          </div>
        </div>

        <div className="my-2 border-t border-dashed border-gray-400 dark:border-gray-600" />
        <div className="flex justify-between text-sm font-bold">
          <span>{t("salesHistory.refundedAmount")}</span>
          <span>Rs.{Number(amount).toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={printing}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-surface-muted py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-surface-border disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
        >
          <HiOutlineCheckCircle className="text-lg" />
          {t("receipt.done")}
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={printing}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          <HiOutlinePrinter className="text-lg" />
          {printing ? t("receipt.printing") : t("receipt.print")}
        </button>
      </div>
    </Modal>
  );
}
