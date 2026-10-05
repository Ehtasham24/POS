import { Modal } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { formatPKR } from "utils/money";

// Tapping a product that's already in this sale: one more at the price it already has here
// (one button per price, in case it's in at two), or a new price through the usual dialog.
export default function RepeatPricePrompt({ product, prices, onSamePrice, onNewPrice, onClose }) {
  const { t } = useLanguage();
  return (
    <Modal isOpen onClose={onClose} title={product.productname} maxWidth="max-w-sm">
      <p className="text-sm text-gray-600 dark:text-gray-300">{t("register.alreadyInSale")}</p>
      <div className="mt-4 flex flex-col gap-2">
        {prices.map((price, index) => (
          <button
            key={price}
            type="button"
            autoFocus={index === 0}
            onClick={() => onSamePrice(price)}
            className="flex h-12 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white-A700 hover:bg-primary-700"
          >
            {t("register.samePrice", { amount: formatPKR(price) })}
          </button>
        ))}
        <button
          type="button"
          onClick={onNewPrice}
          className="flex h-12 items-center justify-center rounded-xl bg-surface-muted px-4 text-sm font-semibold text-gray-800 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
        >
          {t("register.newPrice")}
        </button>
      </div>
    </Modal>
  );
}
