import { useState } from "react";
import { useSelector } from "react-redux";
import { HiOutlineShoppingCart, HiChevronUp, HiChevronDown } from "react-icons/hi2";
import { useLanguage } from "i18n/LanguageContext";
import CartPanel from "./CartPanel";

// Always-visible cart, used only on the two pages where items actually get added
// (Categories/POS terminal, Product List) — see cartCheckout.jsx for the click-to-open
// floating button used everywhere else. Side-panel vs. bottom-bar is done purely in CSS
// via the `cartDock` custom screen (tailwind.config.js: min-width 900px). Width, not
// `orientation`, is the signal — a browser window can be taller than it is wide (CSS
// "portrait") while still being plenty wide enough for a 384px side panel, and relying on
// `orientation` alone showed the bottom sheet in that case, covering most of the page. No
// JS media-query branching needed — both variants below are always mounted, visibility is
// just a Tailwind class.
export default function CartDock() {
  const [expanded, setExpanded] = useState(false);
  const cart = useSelector((state) => state.cart.carts);
  const { t } = useLanguage();
  const itemCount = cart.reduce((sum, item) => sum + item.sellingQuantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.sellingPrice * item.sellingQuantity, 0);

  return (
    <>
      {/* Landscape: permanent right-side panel, mirrors the left SidebarContent's
          `fixed inset-y-0` full-height convention in AppShell. */}
      <aside className="hidden cartDock:flex fixed inset-y-0 right-0 z-30 w-96 flex-col border-l border-surface-border bg-white-A700 shadow-card dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-surface-border px-4 py-3 font-poppins font-bold text-gray-800 dark:border-gray-700 dark:text-gray-100">
          {t("cart.title")}
        </div>
        <div className="min-h-0 flex-1">
          <CartPanel />
        </div>
      </aside>

      {/* Portrait: pinned bottom bar — only rendered once there's something to show (or
          the sheet is already open), so an empty cart doesn't permanently eat screen
          space, but the moment an item lands (including by mistake) the summary appears
          with no tap required. */}
      {(cart.length > 0 || expanded) && (
        // left-64/md:left-0 mirrors AppShell's own pl-64/md:pl-0 — the persistent desktop
        // sidebar (w-64) is visible above the "md" breakpoint (>1050px) and sits at a
        // higher z-index, so without this offset it painted over the left edge of this
        // bar/sheet (hiding item names behind it) whenever both were on screen at once.
        <div className="cartDock:hidden fixed left-64 right-0 bottom-0 z-30 md:left-0">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex w-full items-center justify-between bg-primary-600 px-4 py-3 text-white-A700 shadow-modal"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <HiOutlineShoppingCart className="text-lg" />
              {itemCount} {itemCount === 1 ? "item" : "items"} · PKR {subtotal}
            </span>
            {expanded ? <HiChevronDown className="text-lg" /> : <HiChevronUp className="text-lg" />}
          </button>

          {expanded && (
            // Capped, not a flat 75vh — on a browser window that's tall but not
            // phone-sized, 75% of the viewport is far more than a short cart list needs
            // and leaves a large dead gray area below it. min() keeps it proportional on
            // genuinely short (phone) screens while never exceeding ~560px.
            <div className="h-[min(70vh,35rem)] rounded-t-2xl bg-white-A700 shadow-modal dark:bg-gray-800">
              <CartPanel onCheckedOut={() => setExpanded(false)} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
