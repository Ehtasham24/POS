const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { applyStockDelta } = require("./lotService");

const REASON_CODES = ["damaged", "expired", "theft", "count_correction", "other"];

// Mirrors checkoutSale's own transaction shape (Sevices/salesService.js) exactly — a single
// deliberate stock-changing action, FOR UPDATE-locked, throws rather than silently
// adjusting to whatever's possible. Owner-only (enforced at the route level, matching every
// other Inventory-writing route), so no self-vs-owner check is needed here the way
// shiftService/voidSale need one.
const createAdjustment = async (requestingUser, { productId, lotId, quantityChange, reasonCode, note }) => {
  const change = Number(quantityChange);
  if (!Number.isFinite(change) || change === 0) {
    throw new ApiError(400, "Quantity change must be a non-zero number");
  }
  if (!REASON_CODES.includes(reasonCode)) {
    throw new ApiError(400, `Invalid reason code "${reasonCode}"`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { buyingPrice } = await applyStockDelta(client, { productId, lotId, delta: change });

    const { rows } = await client.query(
      `INSERT INTO stock_adjustments (product_id, lot_id, quantity_change, buying_price, reason_code, note, adjusted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [productId, lotId || null, change, buyingPrice, reasonCode, note || null, requestingUser.id]
    );

    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err instanceof ApiError ? err : new ApiError(500, err.message);
  } finally {
    client.release();
  }
};

const listAdjustments = async ({ productId, startDate, endDate, reasonCode } = {}) => {
  const params = [];
  const conditions = [];
  if (productId) {
    params.push(productId);
    conditions.push(`a.product_id = $${params.length}`);
  }
  if (startDate && endDate) {
    params.push(startDate, endDate);
    conditions.push(`a.adjusted_at BETWEEN $${params.length - 1} AND $${params.length}`);
  }
  if (reasonCode) {
    params.push(reasonCode);
    conditions.push(`a.reason_code = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT a.*, p.productname, l.lot_code, u.display_name AS adjusted_by_name
     FROM stock_adjustments a
     JOIN products p ON p.id = a.product_id
     LEFT JOIN lots l ON l.id = a.lot_id
     LEFT JOIN users u ON u.id = a.adjusted_by
     ${where}
     ORDER BY a.adjusted_at DESC`,
    params
  );
  return rows;
};

// Total units and cost impact of shrinkage (negative adjustments only — a positive
// adjustment is a correction-up/found-stock, not a loss) for the Sales Report's Shrinkage
// section, both overall and broken down by reason/product — this is what finally puts
// shrinkage cost somewhere visible, instead of it silently vanishing from every report.
const getShrinkageSummary = async (startDate, endDate) => {
  const { rows: totals } = await pool.query(
    `SELECT COALESCE(SUM(-quantity_change), 0) AS total_units_lost,
            COALESCE(SUM(-quantity_change * buying_price), 0) AS total_cost_impact
     FROM stock_adjustments
     WHERE adjusted_at BETWEEN $1 AND $2 AND quantity_change < 0`,
    [startDate, endDate]
  );

  const { rows: byReason } = await pool.query(
    `SELECT reason_code,
            SUM(-quantity_change) AS units_lost,
            SUM(-quantity_change * buying_price) AS cost_impact
     FROM stock_adjustments
     WHERE adjusted_at BETWEEN $1 AND $2 AND quantity_change < 0
     GROUP BY reason_code
     ORDER BY cost_impact DESC`,
    [startDate, endDate]
  );

  const { rows: byProduct } = await pool.query(
    `SELECT a.product_id, p.productname,
            SUM(-a.quantity_change) AS units_lost,
            SUM(-a.quantity_change * a.buying_price) AS cost_impact
     FROM stock_adjustments a
     JOIN products p ON p.id = a.product_id
     WHERE a.adjusted_at BETWEEN $1 AND $2 AND a.quantity_change < 0
     GROUP BY a.product_id, p.productname
     ORDER BY cost_impact DESC`,
    [startDate, endDate]
  );

  return {
    totalUnitsLost: Number(totals[0].total_units_lost),
    totalCostImpact: Number(totals[0].total_cost_impact),
    byReason,
    byProduct,
  };
};

module.exports = { REASON_CODES, createAdjustment, listAdjustments, getShrinkageSummary };
