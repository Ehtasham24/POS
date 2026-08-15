import { useEffect, useState } from "react";
import { HiOutlinePrinter, HiOutlineCheckCircle } from "react-icons/hi2";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { printReceipt } from "utils/printReceipt";
import { DEFAULT_RECEIPT_TERMS } from "utils/receiptDefaults";
import { apiGet } from "utils/api";
import { withFallback, getSettings as getOfflineSettings } from "offline/cache";

// Shown right after a sale confirms, in place of the browser's own print dialog popping
// up unannounced — which looked out of place for a POS terminal and gave the cashier no
// choice in the matter. This previews the same receipt printReceipt() would produce and
// lets them decide: the sale itself is already saved by the time this opens (checkout
// doesn't wait on this modal), so either button just finishes the interaction — Print
// additionally sends it to the printer (thermal if paired, OS dialog otherwise), Done
// skips that and simply closes.
export default function ReceiptPreviewModal({ isOpen, onClose, items, totalAmount, receiptNo }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [company, setCompany] = useState({});
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    withFallback(() => apiGet("/api/settings"), getOfflineSettings)
      .then(setCompany)
      .catch((error) => console.error("Error fetching company settings for receipt preview:", error));
  }, [isOpen]);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printReceipt(items, totalAmount, receiptNo, { onFallback: toast.info });
    } catch (error) {
      console.error("Error printing receipt:", error);
      toast.error(t("receipt.printError"));
    } finally {
      setPrinting(false);
      onClose();
    }
  };

  const terms = company.receipt_terms ?? DEFAULT_RECEIPT_TERMS;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("receipt.title")} maxWidth="max-w-sm">
      {/* Mirrors the actual printed layout (utils/printReceipt.js) closely enough to be a
          faithful preview — monospace, dashed dividers, centered header — without being a
          pixel-exact reproduction of the 80mm thermal output. */}
      <div className="rounded-xl border border-dashed border-surface-border bg-surface-subtle p-4 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-100">
        <div className="text-center">
          {company.company_logo && (
            <img
              src={company.company_logo}
              alt=""
              className="mx-auto mb-2 max-h-12 max-w-[120px] object-contain"
            />
          )}
          <p className="text-sm font-bold">{company.company_name || "Company Name"}</p>
          {company.company_ntn && <p>NTN: {company.company_ntn}</p>}
          {company.company_address && <p>{company.company_address}</p>}
          {company.company_phone && <p>{company.company_phone}</p>}
          <p className="mt-1 font-bold">{t("receipt.receiptTitle")}</p>
        </div>

        {receiptNo && <p className="mt-2 font-bold">{t("receipt.receiptNo")}: {receiptNo}</p>}
        <p className="mt-1">{new Date().toLocaleString()}</p>
        <div className="my-2 border-t border-dashed border-gray-400 dark:border-gray-600" />

        {items.length === 0 ? (
          <p className="text-center">{t("receipt.noItems")}</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((item, index) => (
              <div key={index}>
                <p className="font-bold">{item.productname}</p>
                <div className="flex justify-between">
                  <span>
                    {item.quantity} x {Number(item.selling_price).toFixed(2)}
                  </span>
                  <span>Rs.{(item.selling_price * item.quantity).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="my-2 border-t border-dashed border-gray-400 dark:border-gray-600" />
        <div className="flex justify-between text-sm font-bold">
          <span>{t("receipt.total")}</span>
          <span>Rs.{totalAmount.toFixed(2)}</span>
        </div>
        <div className="my-2 border-t border-dashed border-gray-400 dark:border-gray-600" />

        <p className="text-center">{t("receipt.thankYou")}</p>
        {terms
          .split("\n")
          .filter((line) => line.trim())
          .map((line, index) => (
            <p key={index} className="text-center text-[11px] font-bold">
              {line}
            </p>
          ))}
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
