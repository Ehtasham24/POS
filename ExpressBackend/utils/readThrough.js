// The reads a shop's register answers from the cloud while it's online, so its Sales History
// and Sales Report cover the shop's whole history, not just the 20 days of sales the register
// keeps (plan-offline-sync.md). Offline, the register answers them from its own database.
// Used on both sides: the register's device/readThrough.js and the cloud's
// Middleware/deviceReadThrough.js.
//
// A register and the cloud number their rows differently (a sale made on a register has one id
// there and another in the cloud); across the two, a row is the same row by its uuid. So every
// id crossing over travels as its uuid and becomes the other side's id on arrival. `params` are
// the ids a request filters by (in its query string or body); `ids` lists the id fields in the
// answer, as [rows, { field: table }] pairs.
const READ_THROUGH = {
  "GET /api/BilledHistory": {
    params: { categoryId: "categories" },
    ids: (body) => [
      [(body.batches || []).flat(), { id: "sales", product_id: "products", sold_by: "users", transaction_id: "sale_transactions" }],
    ],
  },
  "POST /api/Sales/summary": {},
  "POST /api/Sales/products": {
    params: { categoryId: "categories" },
    ids: (body) => [[body.rows || [], { productId: "products", categoryId: "categories" }]],
  },
  "POST /api/Sales/breakdowns": {
    ids: (body) => [
      [body.byCategory || [], { category_id: "categories" }],
      [body.byCashier || [], { user_id: "users" }],
    ],
  },
  "POST /api/Sales/timeseries": {},
  "POST /api/Sales/payment-medium-totals": {},
};

// Stands in for an id that has no counterpart on the other side: ids are positive, so it
// matches nothing — rather than the raw id, which there would be some other row.
const NO_MATCH = "-1";

const readThroughSpec = (method, path) => READ_THROUGH[`${method} ${path}`] || null;

// lookup(table, keys) → Map of key → counterpart, here by one column and there by another
// (id → uuid, or uuid → id). Table and column names only ever come from READ_THROUGH and the
// two callers, never from a request.
const lookupVia = (query, shopId, from, to) => async (table, keys) => {
  const { rows } = await query(
    `SELECT ${from}::text AS k, ${to} AS v FROM ${table} WHERE ${from}::text = ANY($1) AND shop_id = $2`,
    [keys, shopId]
  );
  return new Map(rows.map((r) => [r.k, r.v]));
};

// Swaps the request's filter ids in place (`params` is its query or body).
const swapParams = async (spec, params, lookup) => {
  for (const [name, table] of Object.entries(spec.params || {})) {
    const value = params?.[name];
    if (value == null || value === "") continue;
    const map = await lookup(table, [String(value)]);
    params[name] = map.get(String(value)) ?? NO_MATCH;
  }
};

// Swaps the answer's ids in place. A row whose own id has no counterpart here — an old sale the
// register no longer keeps — is marked `remote`: it can be looked at, not acted on (a void or
// refund has to find the sale in the register's own database).
const swapIds = async (spec, body, lookup) => {
  if (!spec.ids || !body) return body;
  for (const [rows, fields] of spec.ids(body)) {
    for (const [field, table] of Object.entries(fields)) {
      const keys = [...new Set(rows.filter((r) => r[field] != null).map((r) => String(r[field])))];
      if (!keys.length) continue;
      const map = await lookup(table, keys);
      for (const row of rows) {
        if (row[field] == null) continue;
        const swapped = map.get(String(row[field]));
        if (swapped === undefined && field === "id") {
          row.remote = true;
          row.id = `remote-${row.id}`;
        } else {
          row[field] = swapped ?? null;
        }
      }
    }
  }
  return body;
};

module.exports = { readThroughSpec, lookupVia, swapParams, swapIds };
