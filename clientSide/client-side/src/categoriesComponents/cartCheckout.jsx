import { useEffect, useRef, useState } from "react";
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

const POSITION_STORAGE_KEY = "cartFabPosition";
const DRAG_THRESHOLD = 8; // px of pointer movement before a press counts as a drag, not a tap
const BUTTON_SIZE = 56; // h-14/w-14
const EDGE_MARGIN = 8;

function loadSavedPosition() {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    const pos = raw && JSON.parse(raw);
    if (typeof pos?.x === "number" && typeof pos?.y === "number") return pos;
  } catch {
    // corrupt/unavailable storage — just fall back to the default corner
  }
  return null;
}

function clampToViewport(x, y) {
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - BUTTON_SIZE - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - BUTTON_SIZE - EDGE_MARGIN);
  return { x: Math.min(Math.max(x, EDGE_MARGIN), maxX), y: Math.min(Math.max(y, EDGE_MARGIN), maxY) };
}

function CartCheckout() {
  const [expanded, setExpanded] = useState(false);
  const cart = useSelector((state) => state.cart.carts);
  const itemCount = cart.reduce((sum, item) => sum + item.sellingQuantity, 0);
  const pathname = useLocation().pathname;
  const isSellingPage = pathname === "/" || pathname.startsWith("/categories/");
  const { t } = useLanguage();

  // Draggable on any pointer device (touch/mouse/pen) so it can be pulled out of the way
  // when it happens to sit on top of other floating/fixed UI — e.g. Credit/Debit's legend
  // tooltips near the bottom-right of a phone screen. null = default bottom-right corner
  // (plain CSS, no inline position needed); once dragged, the chosen spot is remembered
  // across pages/sessions via localStorage instead of snapping back on every navigation.
  const [position, setPosition] = useState(loadSavedPosition);
  const buttonRef = useRef(null);
  const dragRef = useRef(null); // { startX, startY, originX, originY, moved }
  const suppressClickRef = useRef(false);

  // A saved position from a previous, differently-sized viewport (rotated phone, resized
  // window) could now sit off-screen — pull it back on-screen rather than leaving the
  // button unreachable.
  useEffect(() => {
    if (!position) return;
    const clamped = clampToViewport(position.x, position.y);
    if (clamped.x !== position.x || clamped.y !== position.y) setPosition(clamped);
    const onResize = () => setPosition((prev) => (prev ? clampToViewport(prev.x, prev.y) : prev));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = buttonRef.current.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top, moved: false };
    buttonRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) drag.moved = true;
    if (drag.moved) setPosition(clampToViewport(drag.originX + dx, drag.originY + dy));
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.moved) return;
    suppressClickRef.current = true;
    setPosition((prev) => {
      if (prev) {
        try {
          localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(prev));
        } catch {
          // storage full/unavailable — the position just won't persist, not fatal
        }
      }
      return prev;
    });
  };

  const handleClick = () => {
    // A drag ends with a pointerup that the browser follows with a click event on the
    // same element — without this, releasing a drag would also pop the cart panel open.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setExpanded(true);
  };

  if (isSellingPage) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}
        aria-label="Open cart (drag to move)"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 touch-none items-center justify-center rounded-full bg-primary-600 text-white-A700 shadow-modal transition-colors hover:bg-primary-700"
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
