// The tables a shop's devices sync with the cloud (plan-offline-sync.md, phase 3), shared by both
// ends: the cloud's push/pull (Sevices/syncService.js) and the device (device/syncWorker.js).
//
// Rows are matched across devices by their uuid (settings by its key). Integer ids are each
// database's own: a reference to another row travels as that row's uuid and is turned back into
// a local id on arrival — `refs` lists every such column and the table it points at.
//
// `deltas` are the running stock counts. A device sends how much they changed, never the new
// value, so two devices selling the same item offline both take stock off rather than the
// later one overwriting the earlier (stock may go below zero; the owner reviews it).
const SYNC_TABLES = {
  users: { refs: {} },
  categories: { refs: {} },
  contacts: { refs: {} },
  products: { refs: { category_id: "categories" }, deltas: ["quantity"] },
  lots: {
    refs: { product_id: "products", vendor_id: "contacts", received_by: "users" },
    deltas: ["qty_received", "qty_remaining"],
  },
  shifts: { refs: { opened_by: "users", closed_by: "users" } },
  shift_cash_movements: { refs: { shift_id: "shifts", contact_id: "contacts", recorded_by: "users" } },
  sale_transactions: { refs: { sold_by: "users", contact_id: "contacts", shift_id: "shifts" } },
  sales: {
    refs: { product_id: "products", lot_id: "lots", sold_by: "users", voided_by: "users", transaction_id: "sale_transactions" },
  },
  refunds: {
    refs: { sale_id: "sales", transaction_id: "sale_transactions", refunded_by: "users", contact_id: "contacts", shift_id: "shifts" },
  },
  store_credit_redemptions: { refs: { refund_id: "refunds", transaction_id: "sale_transactions", redeemed_by: "users" } },
  party_transactions: { refs: { contact_id: "contacts", sale_id: "sales", lot_id: "lots" } },
  stock_adjustments: { refs: { product_id: "products", lot_id: "lots", adjusted_by: "users" } },
  settings: { refs: {}, key: "key" },
};

// Parents before children: the order a batch of rows is applied in.
const SYNC_ORDER = Object.keys(SYNC_TABLES);

const keyColumn = (table) => SYNC_TABLES[table].key || "uuid";

// Never sent: each database's own integer id, and shop_id, which the cloud takes from the
// device's registration and a device knows already.
const LOCAL_COLUMNS = new Set(["id", "shop_id"]);

module.exports = { SYNC_TABLES, SYNC_ORDER, keyColumn, LOCAL_COLUMNS };
