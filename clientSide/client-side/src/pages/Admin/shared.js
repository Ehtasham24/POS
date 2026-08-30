// Shared constants/helpers between the admin console's pages (Shops, Usage) and its header —
// kept in one place so the two pages' styling and vocabulary (tier colors, table labels,
// byte formatting) can't quietly drift apart from each other.

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

export const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};
