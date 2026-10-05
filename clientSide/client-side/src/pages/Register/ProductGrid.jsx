import { HiOutlineQrCode } from "react-icons/hi2";
import { useLanguage } from "i18n/LanguageContext";
import { formatPKR } from "utils/money";
import { priceFrom } from "utils/posMemory";

const stockTone = (quantity, threshold) =>
  quantity <= 0
    ? "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-500"
    : quantity <= threshold
    ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
    : "bg-surface-muted text-gray-600 dark:bg-gray-700 dark:text-gray-300";

// No fixed selling price exists (it's agreed per sale and asked for on every tap), so a tile
// never shows one as if it were: "Set price", plus the last price as a quiet hint.
function PriceHint({ price }) {
  const { t } = useLanguage();
  return price ? t("register.lastShort", { amount: formatPKR(price) }) : t("register.setPrice");
}

// The register's product area. Grid = big tap targets for touch tills; list = denser rows
// for keyboard/scanner users with large catalogs. Both show the same four things a cashier
// decides on: which product (name + category colour), the last price it went for, stock,
// and whether it's already in the sale.
export default function ProductGrid({
  products,
  view,
  colorFor,
  lastPrices,
  lowStockThreshold,
  inCartQtyFor,
  onPick,
  poppedId,
}) {
  const { t } = useLanguage();

  if (view === "list") {
    return (
      <ul className="overflow-hidden rounded-2xl border border-surface-border bg-white-A700 dark:border-gray-800 dark:bg-gray-800">
        {products.map((product) => {
          const color = colorFor(product.category_id);
          const price = priceFrom(lastPrices, product.productId);
          const qty = Number(product.quantity) || 0;
          const inCart = inCartQtyFor(product.productId);
          return (
            <li key={product.productId} className="border-b border-surface-border last:border-b-0 dark:border-gray-700">
              <button
                type="button"
                disabled={qty <= 0}
                onClick={() => onPick(product)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-700/60 ${
                  poppedId === product.productId ? "animate-tile-pop" : ""
                }`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} />
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-100">
                  {product.productname}
                </span>
                {product.batch_tracked && (
                  <HiOutlineQrCode className="shrink-0 text-primary-600 dark:text-primary-400" title={t("register.lots")} />
                )}
                {inCart > 0 && (
                  <span className="shrink-0 rounded-full bg-primary-600 px-2 py-0.5 text-xs font-bold text-white-A700">
                    ×{inCart}
                  </span>
                )}
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${stockTone(qty, lowStockThreshold)}`}>
                  {qty <= 0 ? t("register.outOfStock") : t("register.left", { n: qty })}
                </span>
                <span className="w-28 shrink-0 whitespace-nowrap text-right text-xs text-gray-400 sm:w-auto">
                  <PriceHint price={price} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 sm:grid-cols-2 sm:gap-2">
      {products.map((product) => {
        const color = colorFor(product.category_id);
        const price = priceFrom(lastPrices, product.productId);
        const qty = Number(product.quantity) || 0;
        const inCart = inCartQtyFor(product.productId);
        return (
          <button
            key={product.productId}
            type="button"
            disabled={qty <= 0}
            onClick={() => onPick(product)}
            className={`group relative flex h-28 flex-col overflow-hidden rounded-2xl border bg-white-A700 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-cardHover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:bg-gray-800 ${
              inCart > 0
                ? "border-primary-400 dark:border-primary-500/60"
                : "border-surface-border hover:border-primary-300 dark:border-gray-700 dark:hover:border-primary-500/40"
            } ${poppedId === product.productId ? "animate-tile-pop" : ""}`}
          >
            <span className={`h-1.5 w-full shrink-0 ${color.bar}`} />
            <span className="flex flex-1 flex-col p-3">
              <span className="clamp-2 pr-6 text-sm font-semibold leading-snug text-gray-800 dark:text-gray-100">
                {product.productname}
              </span>
              <span className="mt-auto flex items-end justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-medium text-gray-400">
                  <PriceHint price={price} />
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${stockTone(qty, lowStockThreshold)}`}>
                  {qty <= 0 ? t("register.outOfStock") : t("register.left", { n: qty })}
                </span>
              </span>
            </span>
            {inCart > 0 ? (
              <span className="absolute right-2 top-3 rounded-full bg-primary-600 px-2 py-0.5 text-xs font-bold text-white-A700 shadow">
                ×{inCart}
              </span>
            ) : (
              product.batch_tracked && (
                <HiOutlineQrCode
                  className="absolute right-2.5 top-3.5 text-primary-600 dark:text-primary-400"
                  title={t("register.lots")}
                />
              )
            )}
          </button>
        );
      })}
    </div>
  );
}
