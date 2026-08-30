// The one list of shop_id-scoped tables counted toward a shop's DB storage footprint —
// shared by Sevices/adminService.js (getUsageByShop, all shops at once) and
// Sevices/storageQuotaService.js (one shop at a time, for the quota check). Every table
// migration 021 gave a shop_id column, except settings (tiny key-value, not a meaningful
// resource signal) and lot_sequences (an internal counter, not real tenant data).
const USAGE_TABLES = [
  "products",
  "categories",
  "sales",
  "sale_transactions",
  "refunds",
  "lots",
  "contacts",
  "party_transactions",
  "store_credit_redemptions",
  "bank_payment_intents",
  "shifts",
  "shift_cash_movements",
  "stock_adjustments",
  "users",
];

module.exports = { USAGE_TABLES };
