const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");

// Shop subscriptions (migration 031's subscription_payments). Shops pay outside the app —
// cash, bank transfer, a wallet — and the platform admin records each payment here. Every
// payment covers a period; the shop's next due date is the latest covers_until across its
// payments (derived, never stored). A shop with no payments at all isn't billed through this.
//
// Nothing is switched off automatically when a shop falls behind: the admin console flags
// it, the shop's owner sees a reminder, and deactivating is still the admin's decision.

const PAYMENT_METHODS = ["cash", "bank_transfer", "jazzcash", "easypaisa", "card", "other", "trial", "waiver"];
const DUE_SOON_DAYS = 7;
const MAX_MONTHS = 36;
const DAY_MS = 24 * 60 * 60 * 1000;

// SQL for a shop's next due date, for queries over `shops s`.
const DUE_ON_SQL = `(SELECT MAX(p.covers_until) FROM subscription_payments p WHERE p.shop_id = s.id)`;

// 'untracked' (never billed here) / 'active' / 'due_soon' / 'overdue', and whole days until
// the due date (negative once it's passed).
const subscriptionStatus = (dueOn) => {
  if (!dueOn) return { status: "untracked", dueOn: null, daysLeft: null };
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysLeft = Math.round((new Date(dueOn).getTime() - todayUtc) / DAY_MS);
  const status = daysLeft < 0 ? "overdue" : daysLeft <= DUE_SOON_DAYS ? "due_soon" : "active";
  return { status, dueOn, daysLeft };
};

const PAYMENT_COLUMNS = `p.id, p.amount, p.method, p.covers_from, p.covers_until, p.reference, p.note, p.created_at,
  u.display_name AS recorded_by_name`;

const listPayments = async (shopId) => {
  const { rows } = await pool.query(
    `SELECT ${PAYMENT_COLUMNS}
     FROM subscription_payments p LEFT JOIN users u ON u.id = p.recorded_by
     WHERE p.shop_id = $1
     ORDER BY p.covers_until DESC, p.id DESC`,
    [shopId]
  );
  return rows;
};

// Records a payment covering `months` months. The period starts where the shop's current
// one ends — or today, if it has lapsed or never started — unless `coversFrom` says
// otherwise. The shop row is locked for the duration so two payments recorded at once
// can't both start from the same date and overlap.
const recordPayment = async (shopId, { amount, method, months, coversFrom, reference, note }, adminUserId) => {
  const parsedAmount = Number(amount);
  const parsedMonths = Number(months);
  const free = method === "trial" || method === "waiver";
  if (!PAYMENT_METHODS.includes(method)) throw new ApiError(400, `Unknown payment method "${method}"`);
  if (!Number.isInteger(parsedAmount) || parsedAmount < 0) throw new ApiError(400, "Amount must be a whole number of rupees");
  if (free && parsedAmount !== 0) throw new ApiError(400, "A trial or waiver is free — amount must be 0");
  if (!free && parsedAmount === 0) throw new ApiError(400, "Amount is required");
  if (!Number.isInteger(parsedMonths) || parsedMonths < 1 || parsedMonths > MAX_MONTHS) {
    throw new ApiError(400, `Months must be a whole number from 1 to ${MAX_MONTHS}`);
  }
  if (coversFrom && Number.isNaN(new Date(coversFrom).getTime())) throw new ApiError(400, "Invalid start date");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: shop } = await client.query(`SELECT id FROM shops WHERE id = $1 FOR UPDATE`, [shopId]);
    if (!shop[0]) throw new ApiError(404, "Shop not found");
    const { rows } = await client.query(
      `WITH start AS (
         SELECT COALESCE($5::date,
                         GREATEST(CURRENT_DATE, (SELECT MAX(covers_until) FROM subscription_payments WHERE shop_id = $1))) AS d
       )
       INSERT INTO subscription_payments (shop_id, amount, method, covers_from, covers_until, reference, note, recorded_by)
       SELECT $1, $2, $3, start.d, (start.d + make_interval(months => $4))::date, $6, $7, $8 FROM start
       RETURNING id, amount, method, covers_from, covers_until, reference, note, created_at`,
      [
        shopId,
        parsedAmount,
        method,
        parsedMonths,
        coversFrom || null,
        reference?.trim() || null,
        note?.trim() || null,
        adminUserId,
      ]
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// For correcting a mistyped entry. The shop's due date simply falls back to its other payments.
const deletePayment = async (shopId, paymentId) => {
  const { rows } = await pool.query(
    `DELETE FROM subscription_payments WHERE id = $1 AND shop_id = $2
     RETURNING id, amount, method, covers_from, covers_until`,
    [paymentId, shopId]
  );
  if (!rows[0]) throw new ApiError(404, "Payment not found");
  return rows[0];
};

// The shop's own view (runs as the shop — RLS lets it read only its own payments).
const getShopSubscription = async (shopId) => {
  const { rows } = await pool.query(
    `SELECT MAX(covers_until) AS due_on FROM subscription_payments WHERE shop_id = $1`,
    [shopId]
  );
  return subscriptionStatus(rows[0].due_on);
};

module.exports = {
  PAYMENT_METHODS,
  DUE_ON_SQL,
  subscriptionStatus,
  listPayments,
  recordPayment,
  deletePayment,
  getShopSubscription,
};
