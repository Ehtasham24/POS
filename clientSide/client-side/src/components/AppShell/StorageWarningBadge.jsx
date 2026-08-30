import { useEffect, useRef, useState } from "react";
import { apiGet } from "utils/api";
import { formatBytes } from "utils/formatBytes";

const POLL_MS = 60000;

// Global "this shop is near its allotted database storage" indicator, mirroring LowStockBell
// /PendingBankPaymentsBell's exact shape (same poll-on-an-interval reasoning — a page like
// the POS terminal can stay open a long time with no navigation to trigger a refetch).
//
// Renders nothing at all until the shop is actually near its limit (or has no quota
// configured — see storageQuotaService.js's percentUsed:null case) — this is deliberately
// not a persistent "here's your usage" gauge, only a warning that shows up once it matters.
// The glow (a ping-animated duplicate behind the solid dot, the same "live indicator"
// pattern most apps use for an urgent, easy-to-miss-otherwise badge) is what's meant to
// actually catch a cashier's eye during a busy shift, not just a color change.
export default function StorageWarningBadge() {
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const fetchStatus = async () => {
    try {
      setStatus(await apiGet("/api/shop/storage-status"));
    } catch (error) {
      console.error("Error fetching storage status:", error);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!status?.isNearLimit) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Storage limit warning"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl hover:bg-surface-muted dark:hover:bg-gray-800"
      >
        <span className="absolute h-3.5 w-3.5 animate-ping rounded-full bg-danger-500 opacity-75" />
        <span className="relative h-3.5 w-3.5 rounded-full bg-danger-600 ring-2 ring-white-A700 dark:ring-gray-900" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 max-w-[90vw] overflow-hidden rounded-xl border border-surface-border bg-white-A700 shadow-modal dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-surface-border px-4 py-3 font-poppins font-bold text-danger-600 dark:border-gray-700 dark:text-danger-400">
            Storage limit warning
          </div>
          <div className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
            <p className="mb-2">
              You're using{" "}
              <strong className="text-danger-600 dark:text-danger-400">
                {status.percentUsed.toFixed(0)}%
              </strong>{" "}
              of your shop's allotted database storage.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatBytes(status.usedBytes)} of {formatBytes(status.quotaBytes)} used. Contact
              your provider if you need more space.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
