import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HiOutlineInformationCircle } from "react-icons/hi2";

// How far to keep the popup from the viewport edge, in px.
const EDGE_MARGIN = 8;

// Click-to-show (not hover) — works the same on touch/mobile as it does on desktop, unlike
// a pure CSS :hover tooltip which has no equivalent on a phone. Same click-outside-to-close
// pattern already used elsewhere in this app (e.g. PartyActionsMenu on Credit/Debit).
export default function InfoTooltip({ text, className = "" }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const popupRef = useRef(null);
  // How far left (px) to shift the popup from its default left-aligned position, so it
  // stays on-screen instead of pushing the *whole page* into horizontal scroll — this
  // component is used on triggers scattered anywhere across a row (stat cards, legends),
  // and a fixed left-0 anchor overflows the viewport whenever the trigger sits near the
  // right edge, confirmed on a phone with the Credit/Debit legend's rightmost icon.
  const [shiftLeft, setShiftLeft] = useState(0);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setShiftLeft(0);
      return;
    }
    if (!popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    const overflowRight = rect.right - (window.innerWidth - EDGE_MARGIN);
    if (overflowRight > 0) setShiftLeft(overflowRight);
  }, [open]);

  return (
    <span className={`relative inline-flex ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="More info"
        className="flex h-4 w-4 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      >
        <HiOutlineInformationCircle className="text-base" />
      </button>
      {open && (
        <div
          ref={popupRef}
          style={shiftLeft ? { transform: `translateX(-${shiftLeft}px)` } : undefined}
          // z-50, above the global floating cart button (z-40, AppShell/cartCheckout.jsx) —
          // a tooltip the user just deliberately opened must never render underneath other
          // floating chrome, which is exactly what made this unreadable on a phone.
          className="absolute left-0 top-full z-50 mt-1.5 w-56 max-w-[calc(100vw-1rem)] rounded-lg border border-surface-border bg-white-A700 p-2.5 text-xs font-normal normal-case leading-relaxed text-gray-600 shadow-modal dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          {text}
        </div>
      )}
    </span>
  );
}
