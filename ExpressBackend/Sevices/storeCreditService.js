const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");

// Gift-voucher model, not a customer-account model (see migrations/011_store_credit_vouchers.sql
// for the full reasoning) — a store-credit refund IS the voucher, its own id/REF-XXXXXX number
// IS the redemption code. No customer identity required anywhere in this file.

const DEFAULT_PAGE_SIZE = 20;

const REFUND_CODE_PREFIX = /^REF-/i;
const parseVoucherCode = (code) => {
  const refundId = parseInt(String(code ?? "").replace(REFUND_CODE_PREFIX, ""), 10);
  return Number.isFinite(refundId) ? refundId : null;
};

// Looked up by code at checkout (any staff) to show the balance before redeeming, and again
// server-side inside redeemVoucher for the real check. Returns null for a bad/unrecognized
// code rather than throwing — callers decide how to surface "not found" for their context.
const getVoucherByCode = async (code) => {
  const refundId = parseVoucherCode(code);
  if (refundId == null) return null;
  const { rows } = await pool.query(
    `SELECT refund_id, initial_amount, balance, contact_id
     FROM store_credit_voucher_balances WHERE refund_id = $1`,
    [refundId]
  );
  return rows[0] || null;
};

// Runs inside checkoutSale's own transaction (same client) — locking the refunds row here is
// what makes two concurrent redemptions against the SAME voucher serialize correctly, same
// FOR UPDATE reasoning already established for refundSale/voidSale: the second transaction's
// lock-acquire blocks until the first commits, and this transaction's next read of
// store_credit_redemptions (under read-committed) then sees that committed row.
const redeemVoucher = async (client, { code, amount, transactionId, requestingUser }) => {
  const refundId = parseVoucherCode(code);
  if (refundId == null) throw new ApiError(400, "Invalid voucher code");
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new ApiError(400, "Store credit amount must be greater than 0");
  }

  const { rows } = await client.query(
    `SELECT * FROM refunds WHERE id = $1 AND refund_method = 'store_credit' FOR UPDATE`,
    [refundId]
  );
  const voucher = rows[0];
  if (!voucher) throw new ApiError(404, "Invalid voucher code");

  const { rows: redeemedRows } = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS redeemed FROM store_credit_redemptions WHERE refund_id = $1`,
    [refundId]
  );
  const balance = Number(voucher.refund_amount) - Number(redeemedRows[0].redeemed);
  if (amountNum > balance) {
    throw new ApiError(409, `Only Rs.${balance} remains on this voucher`);
  }

  const { rows: inserted } = await client.query(
    `INSERT INTO store_credit_redemptions (refund_id, amount, transaction_id, redeemed_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [refundId, amountNum, transactionId || null, requestingUser?.id || null]
  );
  return inserted[0];
};

// Store Credit page: every voucher still holding a balance, with its optional tagged customer.
const listActiveVouchers = async () => {
  const { rows } = await pool.query(
    `SELECT vb.refund_id, vb.initial_amount, vb.balance, vb.refunded_at, vb.contact_id, c.name AS contact_name
     FROM store_credit_voucher_balances vb
     LEFT JOIN contacts c ON c.id = vb.contact_id
     WHERE vb.balance > 0
     ORDER BY vb.refunded_at DESC`
  );
  return rows;
};

// Paginated redemption history for one voucher — mirrors the running_balance shape already
// established for party/store-credit history views elsewhere, just starting from a fixed
// initial_amount instead of summing from zero.
const getVoucherHistory = async (refundId, page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM store_credit_redemptions WHERE refund_id = $1`,
    [refundId]
  );
  const totalCount = parseInt(countResult.rows[0].total, 10) || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;

  const { rows } = await pool.query(
    `SELECT id, refund_id, amount, transaction_id, redeemed_by, redeemed_at
     FROM store_credit_redemptions
     WHERE refund_id = $1
     ORDER BY redeemed_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [refundId, pageSize, offset]
  );

  return { redemptions: rows, totalCount, totalPages, page: safePage, pageSize };
};

module.exports = {
  parseVoucherCode,
  getVoucherByCode,
  redeemVoucher,
  listActiveVouchers,
  getVoucherHistory,
};
