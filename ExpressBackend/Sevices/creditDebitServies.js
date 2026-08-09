const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");

// Every query function below rethrows on failure — the earlier version of this file just
// logged and returned undefined, which meant any DB error (including the missing-name bug
// this fixes) surfaced as a confusing "Cannot read properties of undefined" crash instead
// of a clean error response.

const fetchAllRecords = async () => {
  try {
    // Prefer the linked contact's current name (single source of truth) but fall back to the
    // legacy free-text name for any rows created before contacts existed.
    const resultDebit = await pool.query(
      `SELECT d.*, COALESCE(c.name, d.name) AS name
       FROM public."debit" d
       LEFT JOIN contacts c ON c.id = d.contact_id
       ORDER BY d.id`
    );
    const resultCredit = await pool.query(
      `SELECT cr.*, COALESCE(c.name, cr.name) AS name
       FROM public."credit" cr
       LEFT JOIN contacts c ON c.id = cr.contact_id
       ORDER BY cr.id`
    );
    return { Debit: resultDebit.rows, Credit: resultCredit.rows };
  } catch (err) {
    console.log("services error", err);
    throw err;
  }
};

const fetchCreditByName = async (name) => {
  try {
    const result = await pool.query(
      `SELECT * FROM public."credit" WHERE name ILIKE $1`,
      [name]
    );
    return result;
  } catch (err) {
    console.log("services error", err);
    throw err;
  }
};

// Credit/debit rows still require a legacy `name` text column (NOT NULL). The modern
// contact-based Add Receivable/Payable forms only send contact_id, so when no explicit
// name is given, resolve it from the linked contact instead of hitting the NOT NULL
// constraint (which previously crashed the request instead of failing cleanly).
const resolveName = async (name, contact_id) => {
  if (name) return name;
  if (contact_id) {
    const { rows } = await pool.query(`SELECT name FROM contacts WHERE id = $1`, [contact_id]);
    if (rows[0]?.name) return rows[0].name;
  }
  throw new ApiError(400, "A contact or name is required");
};

const insertCredit = async (name, amount_due, amount_received, contact_id) => {
  try {
    const resolvedName = await resolveName(name, contact_id);
    const result = await pool.query(
      `INSERT INTO public.credit(
    name, amount_due, amount_received, amount_pending, total_amount_id, contact_id)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *
`,
      [resolvedName, amount_due, amount_received, amount_due - amount_received, null, contact_id || null]
    );
    return result;
  } catch (err) {
    console.log("services error", err);
    throw err;
  }
};

const updateCreditByName = async (
  name,
  amountdue,
  amountrecieved,
  total_amount
) => {
  try {
    const result = await pool.query(
      `
  UPDATE public.credit
  SET amount_due = $2, amount_received = $3, amount_pending = $4, total_amount_id = $5
  WHERE name ILIKE $1
  RETURNING id, amount_due, amount_received, amount_pending, total_amount_id
`,
      [`%${name}%`, amountdue, amountrecieved, total_amount]
    );
    return result;
  } catch (err) {
    console.log("services error", err);
    throw err;
  }
};

const deleteCreditByName = async (name) => {
  try {
    const result = await pool.query(
      `
            DELETE FROM public.credit
            WHERE name ILIKE $1
        `,
      [`%${name}%`]
    );
    return result;
  } catch (err) {
    console.log(`service error, ${err}`);
    throw err;
  }
};

const updateCreditById = async (id, contact_id, amount_due, amount_received) => {
  try {
    const result = await pool.query(
      `UPDATE public.credit
       SET contact_id = $2, amount_due = $3, amount_received = $4,
           amount_pending = GREATEST($3::numeric - $4::numeric, 0)
       WHERE id = $1
       RETURNING *`,
      [id, contact_id, amount_due, amount_received]
    );
    return result;
  } catch (err) {
    console.log("services error", err);
    throw err;
  }
};

const settleCredit = async (id, amountPaid) => {
  try {
    const result = await pool.query(
      `UPDATE public.credit
       SET amount_received = amount_received + $2,
           amount_pending = GREATEST(amount_pending - $2, 0)
       WHERE id = $1
       RETURNING *`,
      [id, amountPaid]
    );
    return result;
  } catch (err) {
    console.log("services error", err);
    throw err;
  }
};

const fetchDebitByName = async (name) => {
  try {
    const result = await pool.query(
      `SELECT * FROM public."debit" WHERE name ILIKE $1`,
      [name]
    );
    return result;
  } catch (err) {
    console.log("services error", err);
    throw err;
  }
};

const insertDebit = async (name, amount_due, amount_received, contact_id) => {
  try {
    const resolvedName = await resolveName(name, contact_id);
    const result = await pool.query(
      `INSERT INTO public.debit(
    name, amount_due, amount_received, amount_pending, total_amount_id, contact_id)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *
`,
      [resolvedName, amount_due, amount_received, amount_due - amount_received, null, contact_id || null]
    );
    return result;
  } catch (err) {
    console.log("services error", err);
    throw err;
  }
};

const updateDebitByName = async (
  name,
  amount_due,
  amount_received,
  total_amount
) => {
  try {
    const result = await pool.query(
      `
  UPDATE public.debit
  SET amount_due = $2, amount_received = $3, amount_pending = $4, total_amount_id = $5
  WHERE name ILIKE $1
  RETURNING id, amount_due, amount_received, amount_pending, total_amount_id
`,
      [`%${name}%`, amount_due, amount_received, total_amount]
    );
    return result;
  } catch (err) {
    console.log("services error", err);
    throw err;
  }
};

const deleteDebitByName = async (name) => {
  try {
    const result = await pool.query(
      `
            DELETE FROM public.debit
            WHERE name ILIKE $1
        `,
      [`%${name}%`]
    );
    return result;
  } catch (err) {
    console.log(`service error, ${err}`);
    throw err;
  }
};

const updateDebitById = async (id, contact_id, amount_due, amount_received) => {
  try {
    const result = await pool.query(
      `UPDATE public.debit
       SET contact_id = $2, amount_due = $3, amount_received = $4,
           amount_pending = GREATEST($3::numeric - $4::numeric, 0)
       WHERE id = $1
       RETURNING *`,
      [id, contact_id, amount_due, amount_received]
    );
    return result;
  } catch (err) {
    console.log("services error", err);
    throw err;
  }
};

const settleDebit = async (id, amountPaid) => {
  try {
    const result = await pool.query(
      `UPDATE public.debit
       SET amount_received = amount_received + $2,
           amount_pending = GREATEST(amount_pending - $2, 0)
       WHERE id = $1
       RETURNING *`,
      [id, amountPaid]
    );
    return result;
  } catch (err) {
    console.log("services error", err);
    throw err;
  }
};

module.exports = {
  fetchAllRecords,
  fetchCreditByName,
  insertCredit,
  updateCreditByName,
  updateCreditById,
  deleteCreditByName,
  settleCredit,
  fetchDebitByName,
  insertDebit,
  updateDebitByName,
  updateDebitById,
  deleteDebitByName,
  settleDebit,
};
