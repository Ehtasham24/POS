import { useState } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import { HiOutlineShoppingCart, HiChevronDown } from "react-icons/hi2";
import { useLanguage } from "i18n/LanguageContext";
import CartPanel from "./CartPanel";

// Floating cart icon + item-count badge, rendered globally (AppShell) so the cart is
// reachable from every page. Categories (the POS terminal, "/") and Product List
// ("/categories/:id") — the only two pages where items actually get added to the cart —
// instead render the always-visible CartDock, so this component steps aside there
// entirely to avoid a redundant duplicate cart affordance. Every other page has no such
// alternative, so it always shows.
function CartCheckout() {
  const [expanded, setExpanded] = useState(false);
  const cart = useSelector((state) => state.cart.carts);
  const itemCount = cart.reduce((sum, item) => sum + item.sellingQuantity, 0);
  const pathname = useLocation().pathname;
  const isSellingPage = pathname === "/" || pathname.startsWith("/categories/");
  const { t } = useLanguage();

  if (isSellingPage) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Open cart"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white-A700 shadow-modal transition-colors hover:bg-primary-700"
      >
        <HiOutlineShoppingCart className="text-2xl" />
        {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-danger-600 px-1 text-xs font-bold text-white-A700 ring-2 ring-white-A700 dark:ring-gray-900">
            {itemCount}
          </span>
        )}
      </button>

      {expanded && (
        <>
          <div className="fixed inset-0 z-40 bg-gray-900/60" onClick={() => setExpanded(false)} />
          {/* Capped, not a flat 85vh — on a browser window that's tall but not
              phone-sized, 85% of the viewport is far more than a short cart list needs
              and leaves a large dead gray area below it. min() keeps it proportional on
              genuinely short (phone) screens while never exceeding ~600px total. */}
          {/* left-64/md:left-0 mirrors AppShell's own pl-64/md:pl-0 — clears the
              persistent desktop sidebar (visible above the "md" breakpoint, >1050px),
              which otherwise painted over the left edge of this sheet. */}
          <div className="fixed left-64 right-0 bottom-0 z-50 flex h-[min(75vh,38rem)] flex-col rounded-t-2xl bg-white-A700 shadow-modal dark:bg-gray-800 md:left-0">
            <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-4 dark:border-gray-700">
              <span className="font-poppins font-bold text-gray-800 dark:text-gray-100">{t("cart.title")}</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close cart"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <HiChevronDown className="text-lg" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <CartPanel onCheckedOut={() => setExpanded(false)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default CartCheckout;
