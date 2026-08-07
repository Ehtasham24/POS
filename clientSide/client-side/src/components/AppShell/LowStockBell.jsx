import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineBell, HiOutlineExclamationTriangle, HiOutlineXCircle } from "react-icons/hi2";

const POLL_MS = 60000;

// Global "below low-stock threshold" indicator, rendered on every page (AppShell).
// Reuses the same /api/inventory status/threshold logic already powering the Inventory
// page's badges, so the two never disagree. Polls periodically since a page (e.g. the
// POS terminal) can stay open a long time without a navigation to trigger a refetch.
export default function LowStockBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const fetchAlerts = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/inventory");
      if (!response.ok) return;
      const data = await response.json();
      setItems(
        (data.items || []).filter((item) => item.status === "low_stock" || item.status === "out_of_stock")
      );
    } catch (error) {
      console.error("Error fetching low-stock alerts:", error);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, POLL_MS);
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

  const goToInventory = () => {
    setOpen(false);
    navigate("/inventory");
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Low stock alerts"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-surface-muted dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <HiOutlineBell className="text-xl" />
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-600 px-1 text-[11px] font-bold text-white-A700 ring-2 ring-white-A700 dark:ring-gray-900">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-surface-border bg-white-A700 shadow-modal dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-surface-border px-4 py-3 font-poppins font-bold text-gray-800 dark:border-gray-700 dark:text-gray-100">
            Stock Alerts
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Everything is well stocked.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={goToInventory}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-subtle dark:hover:bg-gray-700"
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        item.status === "out_of_stock"
                          ? "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400"
                          : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                      }`}
                    >
                      {item.status === "out_of_stock" ? (
                        <HiOutlineXCircle className="text-base" />
                      ) : (
                        <HiOutlineExclamationTriangle className="text-base" />
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                      {item.productname}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {item.quantity} left
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
