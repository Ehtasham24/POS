const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");

// Mirrors partyLedgerService.js's append-only-ledger + derived-balance shape exactly (see
// migrations/010_store_credit.sql for why this is a separate table from party_transactions,
// not a third direction bolted onto it). issueCredit/redeemCredit accept an explicit `client`
// so they can run INSIDE refundSale's/checkoutSale's own transaction in salesService.js —
// same connection, so a credit issue/redeem is always atomic with the refund/checkout that
// caused it, never left as a separate uncommitted step if something else in that transaction
// fails.

const DEFAULT_PAGE_SIZE = 20;

const getBalance = async (contactId, client = pool) => {
  const { rows } = await client.query(
    `SELECT balance FROM store_credit_balances WHERE contact_id = $1`,
    [contactId]
  );
  return rows[0] ? Number(rows[0].balance) : 0;
};

const issueCredit = async (client, { contactId, amount, refundId, note, requestingUser }) => {
  if (!contactId) throw new ApiError(400, "A customer must be selected to issue store credit");
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new ApiError(400, "Store credit amount must be greater than 0");
  }

  const { rows } = await client.query(
    `INSERT INTO store_credit_transactions (contact_id, kind, amount, refund_id, note, created_by)
     VALUES ($1, 'issue', $2, $3, $4, $5)
     RETURNING *`,
    [contactId, amountNum, refundId || null, note || null, requestingUser?.id || null]
  );
  return rows[0];
};

const redeemCredit = async (client, { contactId, amount, transactionId, requestingUser }) => {
  if (!contactId) throw new ApiError(400, "A customer must be selected to redeem store credit");
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new ApiError(400, "Store credit amount must be greater than 0");
  }

  // Row-locks this contact's existing ledger rows first — same reasoning as refundSale's
  // FOR UPDATE on the sales row: makes two concurrent redemptions for the same contact
  // serialize (the second waits for the first to commit) instead of both reading the same
  // balance and together overspending it. A contact with zero existing rows locks nothing,
  // but that's fine — their balance is genuinely 0 either way, so any redeem attempt fails
  // the balance check below regardless of locking.
  await client.query(`SELECT 1 FROM store_credit_transactions WHERE contact_id = $1 FOR UPDATE`, [
    contactId,
  ]);

  const balance = await getBalance(contactId, client);
  if (amountNum > balance) {
    throw new ApiError(409, `Only Rs.${balance} of store credit is available for this customer`);
  }

  const { rows } = await client.query(
    `INSERT INTO store_credit_transactions (contact_id, kind, amount, transaction_id, created_by)
     VALUES ($1, 'redeem', $2, $3, $4)
     RETURNING *`,
    [contactId, amountNum, transactionId || null, requestingUser?.id || null]
  );
  return rows[0];
};

// Every customer with at least one store-credit transaction, with derived balances — mirrors
// partyLedgerService.js's listParties. INNER JOIN is deliberate: store_credit_balances only
// has a row for a contact once it has >=1 transaction.
const listCustomersWithCredit = async () => {
  const { rows } = await pool.query(
    `SELECT c.id AS contact_id, c.name, c.phone,
            scb.balance, scb.total_issued, scb.total_redeemed,
            scb.last_activity_on, scb.transaction_count
     FROM contacts c
     JOIN store_credit_balances scb ON scb.contact_id = c.id
     ORDER BY c.name`
  );
  return rows;
};

// Paginated transaction history for one customer — mirrors partyLedgerService.js's
// getPartyTransactions, including the running_balance window function computed over the
// customer's FULL history so each page's rows show "balance as of this transaction."
const getCustomerHistory = async (contactId, page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM store_credit_transactions WHERE contact_id = $1`,
    [contactId]
  );
  const totalCount = parseInt(countResult.rows[0].total, 10) || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;

  const { rows } = await pool.query(
    `SELECT id, contact_id, kind, amount, refund_id, transaction_id, note, occurred_on, created_by,
            SUM(CASE WHEN kind = 'redeem' THEN -amount ELSE amount END)
              OVER (ORDER BY occurred_on, id ROWS UNBOUNDED PRECEDING) AS running_balance
     FROM store_credit_transactions
     WHERE contact_id = $1
     ORDER BY occurred_on DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [contactId, pageSize, offset]
  );

  return { transactions: rows, totalCount, totalPages, page: safePage, pageSize };
};

module.exports = {
  getBalance,
  issueCredit,
  redeemCredit,
  listCustomersWithCredit,
  getCustomerHistory,
};
