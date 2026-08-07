const { pool } = require("../Db");

const getContacts = async (type) => {
  let query = `SELECT * FROM contacts`;
  const params = [];
  if (type === "vendor") {
    query += ` WHERE is_vendor = true`;
  } else if (type === "customer") {
    query += ` WHERE is_customer = true`;
  }
  query += ` ORDER BY name`;
  const result = await pool.query(query, params);
  return result.rows;
};

const getContactById = async (id) => {
  const result = await pool.query(`SELECT * FROM contacts WHERE id = $1`, [id]);
  return result.rows[0] || null;
};

const createContact = async ({ name, is_customer, is_vendor, phone, email, address }) => {
  const result = await pool.query(
    `INSERT INTO contacts (name, is_customer, is_vendor, phone, email, address)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, !!is_customer, !!is_vendor, phone || null, email || null, address || null]
  );
  return result.rows[0];
};

const updateContact = async (id, { name, is_customer, is_vendor, phone, email, address }) => {
  const result = await pool.query(
    `UPDATE contacts
     SET name = $2, is_customer = $3, is_vendor = $4, phone = $5, email = $6, address = $7
     WHERE id = $1
     RETURNING *`,
    [id, name, !!is_customer, !!is_vendor, phone || null, email || null, address || null]
  );
  return result.rows[0];
};

module.exports = { getContacts, getContactById, createContact, updateContact };
