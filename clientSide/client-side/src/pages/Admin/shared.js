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

export const cardClass =
  "rounded-xl2 border border-surface-border bg-white-A700 shadow-card dark:border-gray-700 dark:bg-gray-800";

// A titled panel; `actions` sits on the right of the title.
export function Card({ title, actions, className = "", children }) {
  return (
    <section className={`${cardClass} ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-5 py-3 dark:border-gray-700">
          <h2 className="font-poppins text-base font-bold text-gray-800 dark:text-gray-100">{title}</h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

// One headline number. `note` is a line of context under it.
export function StatTile({ label, value, note, valueClassName }) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 font-poppins text-2xl font-bold ${valueClassName || "text-gray-800 dark:text-gray-100"}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{note}</p>}
    </div>
  );
}

export const thClass = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";
export const tdClass = "px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200";

export const buttonClass = {
  primary:
    "rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-muted disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700",
  danger:
    "rounded-lg px-3 py-1.5 text-sm font-medium text-danger-600 transition-colors hover:bg-danger-50 disabled:opacity-50 dark:text-danger-400 dark:hover:bg-danger-500/10",
};

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

// A date-only value from the API ("2026-10-28T00:00:00.000Z" = that calendar day).
export const formatDay = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" }) : "—";

// "just now" / "5 min ago" / "3 h ago" / "12 days ago"; "never" for no date.
export const timeAgo = (value) => {
  if (!value) return "never";
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} day${seconds < 172800 ? "" : "s"} ago`;
};

// Where a shop's subscription stands (Sevices/subscriptionService.js's subscriptionStatus).
export const SUBSCRIPTION_CHIP = {
  untracked: { label: "Not billed", className: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" },
  active: { label: "Paid", className: "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500" },
  due_soon: { label: "Due soon", className: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  overdue: { label: "Overdue", className: "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-500" },
};

export function SubscriptionChip({ subscription }) {
  const chip = SUBSCRIPTION_CHIP[subscription?.status || "untracked"];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip.className}`}>{chip.label}</span>
  );
}

// Shared with the shop app's announcement banner (components/AppShell/ShopNotices.jsx).
export { SEVERITY_CLASS } from "utils/severity";

// What each audit action reads as. Anything not listed shows its raw name.
export const AUDIT_ACTION_LABEL = {
  "shop.create": "Created shop",
  "shop.update": "Edited shop",
  "shop.tier": "Changed plan",
  "shop.activate": "Activated shop",
  "shop.deactivate": "Deactivated shop",
  "shop.owner_profile": "Edited owner profile",
  "user.activate": "Activated user",
  "user.deactivate": "Deactivated user",
  "user.password_reset": "Reset user's password",
  "billing.payment": "Recorded payment",
  "billing.payment_delete": "Deleted payment",
  "announcement.create": "Sent announcement",
  "announcement.end": "Ended announcement",
  "password_reset.approve": "Approved password reset",
  "password_reset.reject": "Rejected password reset",
  "platform.capacity": "Changed DB capacity",
  "admin.password": "Changed own password",
};

// An audit entry's before/after, as "key: value" pairs.
export const auditDetails = (details) =>
  Object.entries(details || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(" · ");
