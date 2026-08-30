// Shared constants/helpers between the admin console's pages (Shops, Usage, Estimator) and
// its header — kept in one place so the pages' styling and vocabulary (tier colors, table
// labels, byte formatting) can't quietly drift apart from each other.
import React from "react";

export const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-1.5 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
export const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

export const TIERS = ["basic", "smart", "advanced"];
export const TIER_CHIP_CLASS = {
  basic: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  smart: "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400",
  advanced: "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
};

// Every table Sevices/adminService.js's getUsageByShop tracks (migration 021's full
// shop_id list, minus settings/lot_sequences — see that function's own comment).
export const USAGE_TABLE_LABEL = {
  products: "Products",
  categories: "Categories",
  sales: "Sales",
  sale_transactions: "Transactions",
  refunds: "Refunds",
  lots: "Lots",
  contacts: "Contacts",
  party_transactions: "Ledger entries",
  store_credit_redemptions: "Store credit",
  bank_payment_intents: "Bank payments",
  shifts: "Shifts",
  shift_cash_movements: "Cash movements",
  stock_adjustments: "Stock adjustments",
  users: "Users",
};

// Re-exported (not redefined) so this and the shop-facing storage-warning badge
// (components/AppShell/StorageWarningBadge.jsx) can never quietly format bytes differently.
export { formatBytes } from "utils/formatBytes";

// Matches Sevices/storageQuotaService.js's WARNING_THRESHOLD_PERCENT exactly — the point
// past which a shop's own AppShell lights up its glowing storage-warning badge. Kept as one
// named constant here (not just a bare 75 wherever a threshold check happens) so the admin
// Usage page's own coloring/labels can't quietly drift from what actually triggers the
// shop-facing warning.
export const QUOTA_WARNING_PERCENT = 75;

// green under half, amber approaching the limit, red at/past the same threshold that lights
// up the shop's own warning badge — one scale, used everywhere a quota percentage is shown.
export const quotaBarColorClass = (percent) => {
  if (percent >= QUOTA_WARNING_PERCENT) return "bg-danger-600";
  if (percent >= 50) return "bg-amber-500";
  return "bg-success-600";
};
export const quotaTextColorClass = (percent) => {
  if (percent >= QUOTA_WARNING_PERCENT) return "text-danger-600 dark:text-danger-400";
  if (percent >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-success-600 dark:text-success-500";
};

// A magnitude-vs-total (share of something), never a category comparison — one color per
// bar, never a categorical set, per the same reasoning as the per-table breakdown charts'
// single hue. Used by both Usage.jsx (real, measured shares) and Estimator.jsx (projected
// shares) so the two pages' "here's a percentage of something bigger" visual never drifts.
export function ShareBar({ label, note, percent, colorClass }) {
  return (
    <div className="rounded-xl2 border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-gray-800 dark:text-gray-100">{label}</span>
        <span className="text-gray-500 dark:text-gray-400">{note}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-surface-muted dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${Math.min(Math.max(percent, percent > 0 ? 1.5 : 0), 100)}%` }}
        />
      </div>
    </div>
  );
}
