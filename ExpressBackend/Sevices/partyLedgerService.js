const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");

// Replaces creditDebitServies.js — credit/debit stored three independently-maintained
// running totals per row (amount_due/amount_received/amount_pending) with no timestamps
// and no history; settling overwrote them in place. This is an append-only ledger instead:
// every udhaar and every payment is its own immutable row, and balances are always derived
// (see the party_balances view, migrations/005_party_ledger.sql) rather than stored, so
// they can't drift out of sync with the transactions that produced them.

const VALID_DIRECTIONS = new Set(["receivable", "payable"]);
const VALID_KINDS = new Set(["charge", "payment", "adjustment"]);

const DEFAULT_PAGE_SIZE = 20;

const assertContactExists = async (contactId) => {
  const { rows } = await pool.query(`SELECT id FROM contacts WHERE id = $1`, [contactId]);
  if (!rows[0]) throw new ApiError(400, "Contact not found");
};

const getBalance = async (contactId, direction) => {
  const { rows } = await pool.query(
    `SELECT balance FROM party_balances WHERE contact_id = $1 AND direction = $2`,
    [contactId, direction]
  );
  return rows[0] ? Number(rows[0].balance) : 0;
};

// Every party with at least one transaction in this direction, with derived balances.
// INNER JOIN (not LEFT) is deliberate — party_balances only has a row for a (contact,
// direction) pair once it has ≥1 transaction, so this naturally excludes contacts that
// have never been charged/paid in this direction.
const listParties = async (direction) => {
  if (!VALID_DIRECTIONS.has(direction)) throw new ApiError(400, "Invalid direction");
  const { rows } = await pool.query(
    `SELECT c.id AS contact_id, c.name, c.phone,
            pb.balance, pb.total_charged, pb.total_paid,
            pb.last_activity_on, pb.transaction_count
     FROM contacts c
     JOIN party_balances pb ON pb.contact_id = c.id AND pb.direction = $1
     ORDER BY c.name`,
    [direction]
  );
  return rows;
};

// Paginated transaction history for one party — the data behind the expandable row.
// running_balance is computed with a window function over the party's FULL history
// (the window's own ORDER BY, independent of the outer LIMIT/OFFSET), so each row on any
// page correctly shows "balance as of this transaction," not just a per-page running sum.
const getPartyTransactions = async (contactId, direction, page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
  if (!VALID_DIRECTIONS.has(direction)) throw new ApiError(400, "Invalid direction");

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM party_transactions WHERE contact_id = $1 AND direction = $2`,
    [contactId, direction]
  );
  const totalCount = parseInt(countResult.rows[0].total, 10) || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;

  const { rows } = await pool.query(
    `SELECT id, contact_id, direction, kind, amount, occurred_on, note, sale_id, lot_id, created_at,
            SUM(CASE WHEN kind = 'payment' THEN -amount ELSE amount END)
              OVER (ORDER BY occurred_on, id ROWS UNBOUNDED PRECEDING) AS running_balance
     FROM party_transactions
     WHERE contact_id = $1 AND direction = $2
     ORDER BY occurred_on DESC, id DESC
     LIMIT $3 OFFSET $4`,
    [contactId, direction, pageSize, offset]
  );

  return { transactions: rows, totalCount, totalPages, page: safePage, pageSize };
};

const addTransaction = async ({ contactId, direction, kind, amount, occurredOn, note, saleId, lotId }) => {
  if (!contactId) throw new ApiError(400, "A contact is required");
  if (!VALID_DIRECTIONS.has(direction)) throw new ApiError(400, "Invalid direction");
  if (!VALID_KINDS.has(kind)) throw new ApiError(400, "Invalid transaction kind");

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum === 0) {
    throw new ApiError(400, "Amount must be a non-zero number");
  }
  if ((kind === "charge" || kind === "payment") && amountNum <= 0) {
    throw new ApiError(400, `${kind === "charge" ? "Charge" : "Payment"} amount must be greater than 0`);
  }

  await assertContactExists(contactId);

  if (kind === "payment") {
    const currentBalance = await getBalance(contactId, direction);
    if (amountNum > currentBalance) {
      throw new ApiError(
        400,
        `Payment (${amountNum}) can't exceed the outstanding balance (${currentBalance})`
      );
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO party_transactions (contact_id, direction, kind, amount, occurred_on, note, sale_id, lot_id)
     VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6, $7, $8)
     RETURNING *`,
    [contactId, direction, kind, amountNum, occurredOn || null, note || null, saleId || null, lotId || null]
  );
  return rows[0];
};

// Corrects a mistyped entry (amount/date/note only — not contact/direction/kind, so this
// stays a simple fix rather than reopening the harder question of moving a transaction
// between parties or ledgers). Deliberately pragmatic rather than fully immutable: this is
// a single-owner shop tool, and each row is now atomic, so fixing one entry is unambiguous
// — unlike the old design, where any correction silently rewrote a shared running total.
const updateTransaction = async (id, { amount, occurredOn, note }) => {
  const { rows: existingRows } = await pool.query(`SELECT * FROM party_transactions WHERE id = $1`, [id]);
  const existing = existingRows[0];
  if (!existing) throw new ApiError(404, "Transaction not found");

  const amountNum = amount !== undefined ? Number(amount) : Number(existing.amount);
  if (!Number.isFinite(amountNum) || amountNum === 0) {
    throw new ApiError(400, "Amount must be a non-zero number");
  }
  if ((existing.kind === "charge" || existing.kind === "payment") && amountNum <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  const { rows } = await pool.query(
    `UPDATE party_transactions
     SET amount = $2, occurred_on = COALESCE($3, occurred_on), note = $4
     WHERE id = $1
     RETURNING *`,
    [id, amountNum, occurredOn || null, note !== undefined ? note : existing.note]
  );
  return rows[0];
};

const deleteTransaction = async (id) => {
  const { rows } = await pool.query(`DELETE FROM party_transactions WHERE id = $1 RETURNING *`, [id]);
  if (!rows[0]) throw new ApiError(404, "Transaction not found");
  return rows[0];
};

module.exports = {
  listParties,
  getPartyTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
};
