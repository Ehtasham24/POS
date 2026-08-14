import { useEffect, useRef, useState } from "react";
import { HiOutlineInformationCircle } from "react-icons/hi2";

// Click-to-show (not hover) — works the same on touch/mobile as it does on desktop, unlike
// a pure CSS :hover tooltip which has no equivalent on a phone. Same click-outside-to-close
// pattern already used elsewhere in this app (e.g. PartyActionsMenu on Credit/Debit).
export default function InfoTooltip({ text, className = "" }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
        <div className="absolute left-0 top-full z-30 mt-1.5 w-56 rounded-lg border border-surface-border bg-white-A700 p-2.5 text-xs font-normal normal-case leading-relaxed text-gray-600 shadow-modal dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {text}
        </div>
      )}
    </span>
  );
}
