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
  // Explicit `left` (px, relative to the container) to override the default `left-0` when
  // that would run the popup off-screen — this component is used on triggers scattered
  // anywhere across a row (stat cards, legends), and a fixed left-0 anchor overflows the
  // viewport whenever the trigger sits near the right edge, confirmed on a phone with the
  // Credit/Debit legend's rightmost icon. null = use the default left-0.
  //
  // Deliberately a `left` offset, not a `transform: translateX` — transform only changes
  // where a box is *painted*; the box's untransformed layout position is still what the
  // browser uses to compute the page's scrollable width. A transform-based shift can look
  // fine on the screen that's actually rendering it while still silently widening
  // document.documentElement.scrollWidth, which is exactly what happened here: confirmed
  // on a real phone (a blank strip on the right, page content shifted/scrolled left) even
  // though an automated check of scrollWidth right after clicking hadn't caught it.
  const [leftPx, setLeftPx] = useState(null);

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
      setLeftPx(null);
      return;
    }
    if (!popupRef.current || !containerRef.current) return;
    const popupWidth = popupRef.current.getBoundingClientRect().width;
    const containerLeft = containerRef.current.getBoundingClientRect().left;
    const maxViewportLeft = window.innerWidth - popupWidth - EDGE_MARGIN;
    // Natural position is containerLeft (that's what left:0 renders as); only override it
    // when that would push the popup's right edge past the viewport.
    if (containerLeft > maxViewportLeft) {
      setLeftPx(Math.max(EDGE_MARGIN, maxViewportLeft) - containerLeft);
    } else {
      setLeftPx(null);
    }
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
          style={leftPx !== null ? { left: `${leftPx}px` } : undefined}
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
