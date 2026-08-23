const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");

// How long a shift can go with no real activity (a sale, refund, or cash movement) before
// Sevices/shiftSweep.js's periodic check treats it as abandoned — a crashed app, a closed
// browser tab, a forgotten "Close Shift" click — and closes it automatically rather than
// leaving it open forever (which would block that user from ever opening a new shift again,
// migrations/017's one-open-shift-per-user constraint).
const IDLE_MINUTES = 15;

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

// Bumps last_activity_at — called wherever a shift is genuinely being used (a sale/refund
// attributed to it in checkoutSale/refundSale, a cash movement recorded below). Guarded to
// status='open' so this is a harmless no-op if a race lets it run just after the shift
// closed. Takes an executor (pool or an in-transaction client) so callers already inside a
// transaction (checkoutSale, refundSale) can include this in the same commit/rollback.
const touchActivity = async (executor, shiftId) => {
  if (!shiftId) return;
  await executor.query(`UPDATE shifts SET last_activity_at = NOW() WHERE id = $1 AND status = 'open'`, [
    shiftId,
  ]);
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
  await touchActivity(pool, shiftId);
  return inserted[0];
};

// Cashiers see only their own shifts; owners see everyone's — same split fetchBilledHistory
// (Sevices/salesService.js) already applies to Sales History via its viewerFilter param.
// userId/onlyVariance/minVariance/maxVariance are owner-only filters (a cashier is already
// pinned to their own shifts by the block above, so userId is simply ignored for them rather
// than erroring — there's nothing more specific it could narrow down to).
const listShifts = async (
  requestingUser,
  { status, startDate, endDate, userId, onlyVariance, minVariance, maxVariance } = {}
) => {
  const params = [];
  const conditions = [];
  if (requestingUser?.role !== "owner") {
    params.push(requestingUser.id);
    conditions.push(`opened_by = $${params.length}`);
  } else if (userId) {
    params.push(userId);
    conditions.push(`opened_by = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (startDate && endDate) {
    params.push(startDate, endDate);
    conditions.push(`opened_at BETWEEN $${params.length - 1} AND $${params.length}`);
  }
  if (onlyVariance) {
    conditions.push(`variance IS NOT NULL AND variance <> 0`);
  }
  if (minVariance !== undefined && minVariance !== null && minVariance !== "") {
    params.push(Number(minVariance));
    conditions.push(`variance >= $${params.length}`);
  }
  if (maxVariance !== undefined && maxVariance !== null && maxVariance !== "") {
    params.push(Number(maxVariance));
    conditions.push(`variance <= $${params.length}`);
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

// Closes one abandoned shift — same expected_cash math as closeShift, but counted_cash/
// variance are deliberately left NULL rather than assumed to match: nobody actually counted
// the drawer, so pretending otherwise would silently hide a real shortage if one happened
// during the idle window. auto_closed=true is what routes it to "needs review" on the Shifts
// page and gates reconcileShift below. closed_by stays NULL — nobody closed it, the system did.
const autoCloseOneShift = async (shiftId) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM shifts WHERE id = $1 FOR UPDATE`, [shiftId]);
    const shift = rows[0];
    // Already closed by the time the sweep got to it (a human closed it in the race window
    // between the sweep's SELECT and this lock) — nothing to do, not an error.
    if (!shift || shift.status !== "open") {
      await client.query("ROLLBACK");
      return;
    }

    const [cashSales, cashRefunds, cashMovements] = await Promise.all([
      sumCashSales(client, shiftId),
      sumCashRefunds(client, shiftId),
      sumCashMovements(client, shiftId),
    ]);
    const expectedCash = Number(shift.opening_float) + cashSales - cashRefunds + cashMovements;

    await client.query(
      `UPDATE shifts
       SET status = 'closed', closed_at = NOW(), expected_cash = $2, auto_closed = true,
           notes = $3
       WHERE id = $1`,
      [
        shiftId,
        expectedCash,
        `Auto-closed after ${IDLE_MINUTES} minutes of inactivity — drawer wasn't counted, needs manual review.`,
      ]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    // A sweep failure for one shift shouldn't crash the whole process (Sevices/shiftSweep.js
    // runs this on a timer) — logged and left open for the next sweep pass to retry.
    console.error(`Failed to auto-close shift ${shiftId}:`, err);
  } finally {
    client.release();
  }
};

// Called periodically by Sevices/shiftSweep.js. Returns how many shifts it closed, purely
// for the sweep's own logging.
const autoCloseIdleShifts = async () => {
  const { rows: idle } = await pool.query(
    `SELECT id FROM shifts WHERE status = 'open' AND last_activity_at < NOW() - ($1 || ' minutes')::interval`,
    [IDLE_MINUTES]
  );
  for (const { id } of idle) {
    await autoCloseOneShift(id);
  }
  return idle.length;
};

// Fills in the real counted_cash/variance for a shift the sweep above already auto-closed —
// whoever eventually gets to the actual drawer (the same cashier next time they're in, or the
// owner) records what was really there. Same self-or-owner check every other shift action
// uses. Only valid once, and only for a shift that's actually in the "needs review" state.
const reconcileShift = async (shiftId, requestingUser, countedCash, notes) => {
  const counted = Number(countedCash);
  if (!Number.isFinite(counted) || counted < 0) {
    throw new ApiError(400, "Counted cash must be a non-negative number");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM shifts WHERE id = $1 FOR UPDATE`, [shiftId]);
    const shift = rows[0];
    if (!shift) throw new ApiError(404, "Shift not found");
    if (!shift.auto_closed) throw new ApiError(409, "Only an auto-closed shift needs reconciling");
    if (shift.counted_cash !== null) throw new ApiError(409, "This shift was already reconciled");
    assertCanAct(shift, requestingUser);

    const variance = counted - Number(shift.expected_cash);
    const { rows: updated } = await client.query(
      `UPDATE shifts SET counted_cash = $2, variance = $3, closed_by = $4, notes = COALESCE($5, notes)
       WHERE id = $1 RETURNING *`,
      [shiftId, counted, variance, requestingUser.id, notes || null]
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

module.exports = {
  IDLE_MINUTES,
  getOpenShift,
  openShift,
  closeShift,
  recordCashMovement,
  listShifts,
  getShiftDetail,
  touchActivity,
  autoCloseIdleShifts,
  reconcileShift,
};
