const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");

// Same self-or-owner shape voidSale (Sevices/salesService.js) already establishes: a
// cashier acts on their own shift, an owner can act on anyone's.
const assertCanAct = (shift, requestingUser) => {
  if (requestingUser?.role === "owner") return;
  if (shift.opened_by !== requestingUser?.id) {
    throw new ApiError(403, "You can only manage your own shift");
  }
};

// Returns the caller's own currently-open shift row, or null — used internally by
// checkoutSale/refundSale (Sevices/salesService.js) to auto-stamp shift_id, and by the
// Shifts page to render "shift open" state. userId may be null/undefined (e.g. the
// notification-forwarder's auto-confirm path runs with requestingUser: null) — a sale/
// refund made with nobody logged in simply isn't attributed to any shift.
const getOpenShift = async (userId) => {
  if (!userId) return null;
  const { rows } = await pool.query(
    `SELECT * FROM shifts WHERE opened_by = $1 AND status = 'open'`,
    [userId]
  );
  return rows[0] || null;
};

const openShift = async (requestingUser, openingFloat) => {
  const float = Number(openingFloat);
  if (!Number.isFinite(float) || float < 0) {
    throw new ApiError(400, "Opening float must be a non-negative number");
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO shifts (opened_by, opening_float) VALUES ($1, $2) RETURNING *`,
      [requestingUser.id, float]
    );
    return rows[0];
  } catch (err) {
    // idx_shifts_one_open_per_user (migrations/017) rejects a second open shift for the
    // same user with a unique_violation — surfaced as a clean 409 instead of a raw 500.
    if (err.code === "23505") {
      throw new ApiError(409, "You already have an open shift — close it before opening another");
    }
    throw err;
  }
};

// The three components of expected_cash, queried separately (not via sales_ledger) because
// a refund's cash impact belongs to the shift that was open when the REFUND happened, not
// the shift the original sale was on — sales_ledger nets those together by the original
// sale's date, which would double-count against refunds.shift_id here.
const sumCashSales = async (client, shiftId) => {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(s.selling_price * s.quantity), 0) AS total
     FROM sales s
     JOIN sale_transactions st ON st.id = s.transaction_id
     WHERE st.shift_id = $1 AND st.payment_method = 'cash' AND s.is_voided = false`,
    [shiftId]
  );
  return Number(rows[0].total);
};

const sumCashRefunds = async (client, shiftId) => {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(refund_amount), 0) AS total FROM refunds WHERE shift_id = $1 AND refund_method = 'cash'`,
    [shiftId]
  );
  return Number(rows[0].total);
};

const sumCashMovements = async (client, shiftId) => {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM shift_cash_movements WHERE shift_id = $1`,
    [shiftId]
  );
  return Number(rows[0].total);
};

const closeShift = async (shiftId, requestingUser, countedCash, notes) => {
  const counted = Number(countedCash);
  if (!Number.isFinite(counted) || counted < 0) {
    throw new ApiError(400, "Counted cash must be a non-negative number");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Locking this row is what makes a double-close race (two clicks, or a cashier and an
    // owner closing at once) serialize correctly — same reasoning as confirmIntent's own
    // FOR UPDATE lock (Sevices/bankPaymentService.js).
    const { rows } = await client.query(`SELECT * FROM shifts WHERE id = $1 FOR UPDATE`, [shiftId]);
    const shift = rows[0];
    if (!shift) throw new ApiError(404, "Shift not found");
    if (shift.status === "closed") throw new ApiError(409, "This shift is already closed");
    assertCanAct(shift, requestingUser);

    const [cashSales, cashRefunds, cashMovements] = await Promise.all([
      sumCashSales(client, shiftId),
      sumCashRefunds(client, shiftId),
      sumCashMovements(client, shiftId),
    ]);
    const expectedCash = Number(shift.opening_float) + cashSales - cashRefunds + cashMovements;
    const variance = counted - expectedCash;

    const { rows: updated } = await client.query(
      `UPDATE shifts
       SET status = 'closed', closed_by = $2, closed_at = NOW(),
           expected_cash = $3, counted_cash = $4, variance = $5, notes = $6
       WHERE id = $1 RETURNING *`,
      [shiftId, requestingUser.id, expectedCash, counted, variance, notes || null]
    );
    await client.query("COMMIT");
    return updated[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err instanceof ApiError ? err : new ApiError(500, err.message);
  } finally {
    client.release();
  }
};

const recordCashMovement = async (shiftId, requestingUser, amount, reason, contactId) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value === 0) {
    throw new ApiError(400, "Amount must be a non-zero number");
  }
  if (!reason || !String(reason).trim()) {
    throw new ApiError(400, "A reason is required");
  }

  const { rows } = await pool.query(`SELECT * FROM shifts WHERE id = $1`, [shiftId]);
  const shift = rows[0];
  if (!shift) throw new ApiError(404, "Shift not found");
  if (shift.status !== "open") throw new ApiError(409, "This shift is already closed");
  assertCanAct(shift, requestingUser);

  const { rows: inserted } = await pool.query(
    `INSERT INTO shift_cash_movements (shift_id, amount, reason, contact_id, recorded_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [shiftId, value, reason, contactId || null, requestingUser.id]
  );
  return inserted[0];
};

// Cashiers see only their own shifts; owners see everyone's — same split fetchBilledHistory
// (Sevices/salesService.js) already applies to Sales History via its viewerFilter param.
const listShifts = async (requestingUser, { status } = {}) => {
  const params = [];
  const conditions = [];
  if (requestingUser?.role !== "owner") {
    params.push(requestingUser.id);
    conditions.push(`opened_by = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT s.*, u1.display_name AS opened_by_name, u2.display_name AS closed_by_name
     FROM shifts s
     LEFT JOIN users u1 ON u1.id = s.opened_by
     LEFT JOIN users u2 ON u2.id = s.closed_by
     ${where}
     ORDER BY s.opened_at DESC`,
    params
  );
  return rows;
};

// Full breakdown for one shift — the actual "Z-report" screen: opening float, cash sales/
// refunds/movements that make up expected_cash (live-computed if still open, the snapshotted
// values if closed — see migrations/017's comment on why closed shifts never recompute), plus
// the raw movement list for a human to review.
const getShiftDetail = async (shiftId, requestingUser) => {
  const { rows } = await pool.query(
    `SELECT s.*, u1.display_name AS opened_by_name, u2.display_name AS closed_by_name
     FROM shifts s
     LEFT JOIN users u1 ON u1.id = s.opened_by
     LEFT JOIN users u2 ON u2.id = s.closed_by
     WHERE s.id = $1`,
    [shiftId]
  );
  const shift = rows[0];
  if (!shift) throw new ApiError(404, "Shift not found");
  assertCanAct(shift, requestingUser);

  const { rows: movements } = await pool.query(
    `SELECT m.*, c.name AS contact_name
     FROM shift_cash_movements m
     LEFT JOIN contacts c ON c.id = m.contact_id
     WHERE m.shift_id = $1 ORDER BY m.recorded_at`,
    [shiftId]
  );

  if (shift.status === "closed") {
    return { ...shift, movements };
  }

  const [cashSales, cashRefunds, cashMovements] = await Promise.all([
    sumCashSales(pool, shiftId),
    sumCashRefunds(pool, shiftId),
    sumCashMovements(pool, shiftId),
  ]);
  const expectedCashSoFar = Number(shift.opening_float) + cashSales - cashRefunds + cashMovements;
  return { ...shift, movements, expectedCashSoFar };
};

module.exports = {
  getOpenShift,
  openShift,
  closeShift,
  recordCashMovement,
  listShifts,
  getShiftDetail,
};
