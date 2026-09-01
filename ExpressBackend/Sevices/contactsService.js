const { pool } = require("../Db");

// Pagination (page/pageSize -> LIMIT/OFFSET) is opt-in, same reasoning as
// bankPaymentService.js's listIntents — several OTHER callers (ContactSelect.jsx's
// credit/debit picker, the vendor dropdowns in addProductModel/updateProductModal,
// contactModal) need the FULL list for a picker, not one page of it. Only
// pages/Contacts/index.jsx (the actual management page) passes `page`, and gets the
// paginated shape back; every other caller is unaffected.
const getContacts = async (type, shopId, page, pageSize) => {
  const conditions = ["shop_id = $1"];
  const params = [shopId];
  if (type === "vendor") conditions.push("is_vendor = true");
  else if (type === "customer") conditions.push("is_customer = true");
  const where = `WHERE ${conditions.join(" AND ")}`;

  if (page === undefined) {
    const { rows } = await pool.query(`SELECT * FROM contacts ${where} ORDER BY name`, params);
    return rows;
  }

  const effectivePageSize = pageSize || 20;
  const countResult = await pool.query(`SELECT COUNT(*) AS total FROM contacts ${where}`, params);
  const totalCount = parseInt(countResult.rows[0].total, 10) || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / effectivePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * effectivePageSize;

  const { rows } = await pool.query(
    `SELECT * FROM contacts ${where} ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, effectivePageSize, offset]
  );
  return { contacts: rows, totalCount, totalPages, page: safePage, pageSize: effectivePageSize };
};

const getContactById = async (id, shopId) => {
  const result = await pool.query(`SELECT * FROM contacts WHERE id = $1 AND shop_id = $2`, [id, shopId]);
  return result.rows[0] || null;
};

const createContact = async ({ name, is_customer, is_vendor, phone, email, address }, shopId) => {
  const result = await pool.query(
    `INSERT INTO contacts (name, is_customer, is_vendor, phone, email, address, shop_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [name, !!is_customer, !!is_vendor, phone || null, email || null, address || null, shopId]
  );
  return result.rows[0];
};

// shop_id in the WHERE clause, not just the SELECT — so updating another shop's contact id
// affects zero rows (a clean "not found" upstream) instead of silently editing it.
const updateContact = async (id, { name, is_customer, is_vendor, phone, email, address }, shopId) => {
  const result = await pool.query(
    `UPDATE contacts
     SET name = $2, is_customer = $3, is_vendor = $4, phone = $5, email = $6, address = $7
     WHERE id = $1 AND shop_id = $8
     RETURNING *`,
    [id, name, !!is_customer, !!is_vendor, phone || null, email || null, address || null, shopId]
  );
  return result.rows[0];
};

module.exports = { getContacts, getContactById, createContact, updateContact };
