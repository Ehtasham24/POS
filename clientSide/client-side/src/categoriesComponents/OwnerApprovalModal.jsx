import { useEffect, useState } from "react";
import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";

// The owner's approval for paying with a store-credit voucher while a register is offline
// (device/deviceRoutes.js): the owner types their password on the cashier's screen. Resolves
// with the password, or null when cancelled.
export default function OwnerApprovalModal({ isOpen, onSubmit, onCancel }) {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  useEffect(() => {
    if (isOpen) setPassword("");
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={t("payment.offlineVoucherTitle")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(password);
        }}
        className="space-y-4 p-6"
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">{t("payment.offlineVoucherBody")}</p>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">{t("payment.ownerPassword")}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="off"
            className="block w-full rounded-lg border border-surface-border bg-white-A700 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-surface-muted dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!password}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white-A700 hover:bg-primary-700 disabled:opacity-50"
          >
            {t("payment.approve")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
