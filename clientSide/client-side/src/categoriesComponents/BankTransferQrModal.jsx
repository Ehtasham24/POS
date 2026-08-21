import { useEffect, useState } from "react";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet } from "utils/api";

const POLL_MS = 4000;

// Shown right after a bank-transfer intent is created (CartPanel.jsx's
// handleBankTransferCheckout) — purely informational from here on. The cart is already
// cleared and the cashier is free to serve the next customer; closing this modal does NOT
// cancel the intent, it just stops watching it here (the intent lives on server-side,
// still trackable from the Pending Bank Payments page / PendingBankPaymentsBell). The
// live poll below is a nice-to-have fast path for "customer paid before I even closed
// this" — not required for correctness, since the intent resolves the same way either way.
export default function BankTransferQrModal({ isOpen, onClose, intent }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState(intent?.status || "awaiting_payment");

  useEffect(() => {
    setStatus(intent?.status || "awaiting_payment");
    // Deliberately keyed on identity only — this resets the local status back to the
    // freshly-created intent's own status whenever a *new* intent is shown, not on every
    // status change (the poll below already updates `status` directly; re-running this
    // from a `status` dependency would just be a no-op loop of the same value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.id]);

  useEffect(() => {
    if (!isOpen || !intent?.id || status !== "awaiting_payment") return;
    const interval = setInterval(async () => {
      try {
        const fresh = await apiGet(`/api/bank-payments/intents/${intent.id}`);
        setStatus(fresh.status);
      } catch {
        // Transient poll failure — just try again next tick, same "don't crash a
        // background check over one bad request" spirit as offline/connectivity.js.
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [isOpen, intent?.id, status]);

  if (!intent) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("payment.bankTransfer")}>
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-56 w-56 items-center justify-center overflow-hidden rounded-xl border border-surface-border bg-white dark:border-gray-700">
          <img src={intent.qrDataUrl} alt="Bank transfer QR code" className="h-full w-full object-contain" />
        </div>

        <div>
          <p className="font-poppins text-2xl font-bold text-gray-800 dark:text-gray-100">
            PKR {Number(intent.amount).toFixed(0)}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("payment.scanToPay")}</p>
          <p className="mt-2 font-mono text-xs text-gray-500 dark:text-gray-400">
            {t("payment.reference")}: {intent.referenceCode}
          </p>
        </div>

        {status === "confirmed" ? (
          <div className="w-full rounded-lg bg-success-50 px-4 py-3 text-sm font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-500">
            {t("bankPayments.statusConfirmed")}
          </div>
        ) : status === "cancelled" ? (
          <div className="w-full rounded-lg bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-600 dark:bg-danger-500/10 dark:text-danger-400">
            {t("bankPayments.statusCancelled")}
          </div>
        ) : (
          <div className="w-full rounded-lg bg-surface-muted px-4 py-3 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {t("payment.waitingForConfirmation")}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700 sm:w-auto sm:px-8"
        >
          {t("payment.close")}
        </button>
      </div>
    </Modal>
  );
}
