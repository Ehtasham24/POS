const { pool } = require("../Db");

const getContacts = async (type, shopId) => {
  let query = `SELECT * FROM contacts WHERE shop_id = $1`;
  const params = [shopId];
  if (type === "vendor") {
    query += ` AND is_vendor = true`;
  } else if (type === "customer") {
    query += ` AND is_customer = true`;
  }
  query += ` ORDER BY name`;
  const result = await pool.query(query, params);
  return result.rows;
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
