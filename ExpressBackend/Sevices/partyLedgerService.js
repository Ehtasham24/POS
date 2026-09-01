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

const assertContactExists = async (contactId, shopId) => {
  const { rows } = await pool.query(`SELECT id FROM contacts WHERE id = $1 AND shop_id = $2`, [contactId, shopId]);
  if (!rows[0]) throw new ApiError(400, "Contact not found");
};

const getBalance = async (contactId, direction, shopId) => {
  const { rows } = await pool.query(
    `SELECT balance FROM party_balances WHERE contact_id = $1 AND direction = $2 AND shop_id = $3`,
    [contactId, direction, shopId]
  );
  return rows[0] ? Number(rows[0].balance) : 0;
};

// Every party with at least one transaction in this direction, with derived balances.
// INNER JOIN (not LEFT) is deliberate — party_balances only has a row for a (contact,
// direction) pair once it has ≥1 transaction, so this naturally excludes contacts that
// have never been charged/paid in this direction.
//
// Server-side paginated (page/pageSize -> LIMIT/OFFSET). totalBalance is a real aggregate
// over every party in this direction, not just the current page — pages/CreditDebit's own
// "total payable/receivable" figure needs the true sum regardless of which page is showing
// (a client-side reduce over `rows` would silently undercount once paginated).
const listParties = async (direction, shopId, page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
  if (!VALID_DIRECTIONS.has(direction)) throw new ApiError(400, "Invalid direction");

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(pb.balance), 0) AS total_balance
     FROM contacts c
     JOIN party_balances pb ON pb.contact_id = c.id AND pb.direction = $1 AND pb.shop_id = $2
     WHERE c.shop_id = $2`,
    [direction, shopId]
  );
  const totalCount = parseInt(countResult.rows[0].total, 10) || 0;
  const totalBalance = Number(countResult.rows[0].total_balance);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;

  const { rows } = await pool.query(
    `SELECT c.id AS contact_id, c.name, c.phone,
            pb.balance, pb.total_charged, pb.total_paid,
            pb.last_activity_on, pb.transaction_count
     FROM contacts c
     JOIN party_balances pb ON pb.contact_id = c.id AND pb.direction = $1 AND pb.shop_id = $2
     WHERE c.shop_id = $2
     ORDER BY c.name
     LIMIT $3 OFFSET $4`,
    [direction, shopId, pageSize, offset]
  );
  return { parties: rows, totalCount, totalBalance, totalPages, page: safePage, pageSize };
};

// Every contact's balance in one direction, unbounded, id->balance only (no name/phone/
// pagination) — deliberately separate from listParties above. LedgerTable's "Net Off"
// action needs to look up a PAYABLE row's contact in the RECEIVABLE balances (or vice
// versa) regardless of which page either list is currently showing; this stays a full,
// cheap map so that cross-direction lookup can never silently miss a contact just because
// they're not on the currently-loaded page of the other direction's list.
const getBalanceMap = async (direction, shopId) => {
  if (!VALID_DIRECTIONS.has(direction)) throw new ApiError(400, "Invalid direction");
  const { rows } = await pool.query(
    `SELECT contact_id, balance FROM party_balances WHERE direction = $1 AND shop_id = $2`,
    [direction, shopId]
  );
  return Object.fromEntries(rows.map((r) => [r.contact_id, Number(r.balance)]));
};

// Paginated transaction history for one party — the data behind the expandable row.
// running_balance is computed with a window function over the party's FULL history
// (the window's own ORDER BY, independent of the outer LIMIT/OFFSET), so each row on any
// page correctly shows "balance as of this transaction," not just a per-page running sum.
const getPartyTransactions = async (contactId, direction, page = 1, pageSize = DEFAULT_PAGE_SIZE, shopId) => {
  if (!VALID_DIRECTIONS.has(direction)) throw new ApiError(400, "Invalid direction");

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM party_transactions WHERE contact_id = $1 AND direction = $2 AND shop_id = $3`,
    [contactId, direction, shopId]
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
     WHERE contact_id = $1 AND direction = $2 AND shop_id = $3
     ORDER BY occurred_on DESC, id DESC
     LIMIT $4 OFFSET $5`,
    [contactId, direction, shopId, pageSize, offset]
  );

  return { transactions: rows, totalCount, totalPages, page: safePage, pageSize };
};

const addTransaction = async ({ contactId, direction, kind, amount, occurredOn, note, saleId, lotId }, shopId) => {
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

  await assertContactExists(contactId, shopId);

  if (kind === "payment") {
    const currentBalance = await getBalance(contactId, direction, shopId);
    if (amountNum > currentBalance) {
      throw new ApiError(
        400,
        `Payment (${amountNum}) can't exceed the outstanding balance (${currentBalance})`
      );
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO party_transactions (contact_id, direction, kind, amount, occurred_on, note, sale_id, lot_id, shop_id)
     VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6, $7, $8, $9)
     RETURNING *`,
    [contactId, direction, kind, amountNum, occurredOn || null, note || null, saleId || null, lotId || null, shopId]
  );
  return rows[0];
};

// Corrects a mistyped entry (amount/date/note only — not contact/direction/kind, so this
// stays a simple fix rather than reopening the harder question of moving a transaction
// between parties or ledgers). Deliberately pragmatic rather than fully immutable: this is
// a single-owner shop tool, and each row is now atomic, so fixing one entry is unambiguous
// — unlike the old design, where any correction silently rewrote a shared running total.
const updateTransaction = async (id, { amount, occurredOn, note }, shopId) => {
  const { rows: existingRows } = await pool.query(
    `SELECT * FROM party_transactions WHERE id = $1 AND shop_id = $2`,
    [id, shopId]
  );
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
     WHERE id = $1 AND shop_id = $5
     RETURNING *`,
    [id, amountNum, occurredOn || null, note !== undefined ? note : existing.note, shopId]
  );
  return rows[0];
};

const deleteTransaction = async (id, shopId) => {
  const { rows } = await pool.query(
    `DELETE FROM party_transactions WHERE id = $1 AND shop_id = $2 RETURNING *`,
    [id, shopId]
  );
  if (!rows[0]) throw new ApiError(404, "Transaction not found");
  return rows[0];
};

// A party can owe you (receivable) and be owed by you (payable) at the same time — e.g. a
// vendor you also returned stock to. Rather than move real cash both ways, net-off books a
// negative 'adjustment' on each side for the same amount ("owes less" on both), reducing
// both balances by exactly that much without touching total_charged/total_paid (which stay
// a record of actual charges/cash, not book adjustments). This is the one place two related
// writes must both succeed or neither does — the only real DB transaction in this codebase,
// deliberately: a half-applied net-off (one side adjusted, the other not) would silently
// corrupt both balances, which is worse than anything the old credit/debit design did.
const netOffParty = async (contactId, amount, occurredOn, note, shopId) => {
  if (!contactId) throw new ApiError(400, "A contact is required");
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  await assertContactExists(contactId, shopId);

  const [payableBalance, receivableBalance] = await Promise.all([
    getBalance(contactId, "payable", shopId),
    getBalance(contactId, "receivable", shopId),
  ]);
  const maxNet = Math.min(payableBalance, receivableBalance);
  if (amountNum > maxNet) {
    throw new ApiError(
      400,
      `Net-off amount (${amountNum}) can't exceed the smaller of the two balances (${maxNet})`
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const payableResult = await client.query(
      `INSERT INTO party_transactions (contact_id, direction, kind, amount, occurred_on, note, shop_id)
       VALUES ($1, 'payable', 'adjustment', $2, COALESCE($3, NOW()), $4, $5)
       RETURNING *`,
      [contactId, -amountNum, occurredOn || null, note || "Net off against receivable balance", shopId]
    );
    const receivableResult = await client.query(
      `INSERT INTO party_transactions (contact_id, direction, kind, amount, occurred_on, note, shop_id)
       VALUES ($1, 'receivable', 'adjustment', $2, COALESCE($3, NOW()), $4, $5)
       RETURNING *`,
      [contactId, -amountNum, occurredOn || null, note || "Net off against payable balance", shopId]
    );
    await client.query("COMMIT");
    return { payable: payableResult.rows[0], receivable: receivableResult.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  listParties,
  getBalanceMap,
  getPartyTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  netOffParty,
};
