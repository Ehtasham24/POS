const ApiError = require("./ApiError");

// Every table a request body can point at by id. A foreign key only proves the row EXISTS —
// and Postgres checks foreign keys without applying row-level security — so shop A could
// otherwise attach its own record to shop B's contact/category/sale, and any later JOIN (a
// shift's cash-movement list showing the contact's name, a product listing showing its
// category) would read shop B's row straight back out. migrations/029's same-shop foreign
// keys now make the database reject that too; this check runs first so the caller gets a
// clear "Contact not found" instead of a generic constraint error.
//
// A fixed whitelist (not an arbitrary table-name argument) since the name is interpolated
// into SQL; the label is what the 400 says.
const OWNED_TABLES = {
  contacts: "Contact",
  categories: "Category",
  sales: "Sale",
  lots: "Lot",
  products: "Product",
};

// `refs` maps table -> id, e.g. { contacts: contactId, sales: saleId }. Absent ids are
// skipped — every field this guards is optional at its call site; whether it's REQUIRED stays
// that caller's own validation. All checks run as ONE query. `executor` is the pool or an
// in-transaction client, same convention as shiftService.touchActivity.
const assertOwnedByShop = async (executor, shopId, refs) => {
  const present = Object.entries(refs).filter(([, id]) => id !== undefined && id !== null && id !== "");
  if (present.length === 0) return;

  const params = [shopId];
  const columns = present.map(([table, id], i) => {
    if (!OWNED_TABLES[table]) throw new Error(`assertOwnedByShop: unsupported table "${table}"`);
    params.push(id);
    return `EXISTS (SELECT 1 FROM ${table} WHERE id = $${i + 2} AND shop_id = $1) AS ${table}`;
  });
  const { rows } = await executor.query(`SELECT ${columns.join(", ")}`, params);

  const missing = present.find(([table]) => !rows[0][table]);
  // Same message as a nonexistent id — another shop's id reveals nothing more than a typo.
  if (missing) throw new ApiError(400, `${OWNED_TABLES[missing[0]]} not found`);
};

module.exports = { assertOwnedByShop };
