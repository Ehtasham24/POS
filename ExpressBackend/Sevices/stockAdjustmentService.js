const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { dateRangeCondition } = require("../utils/dateRangeFilter");
const { applyStockDelta } = require("./lotService");

// 'restock' is the only positive-quantity reason meant for routine use — a plain (non-batch-
// tracked) product legitimately receiving more stock, now that Update/Edit Product no longer
// accept a quantity change at all (Sevices/productsService.js). The other reasons are all
// losses/corrections; a positive quantity_change under one of those (e.g. "found a
// miscounted unit") is still allowed, just not the expected routine case.
const REASON_CODES = ["damaged", "expired", "theft", "count_correction", "restock", "other"];

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

    const { buyingPrice } = await applyStockDelta(client, {
      productId,
      lotId,
      delta: change,
      shopId: requestingUser.shopId,
    });

    const { rows } = await client.query(
      `INSERT INTO stock_adjustments (product_id, lot_id, quantity_change, buying_price, reason_code, note, adjusted_by, shop_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [productId, lotId || null, change, buyingPrice, reasonCode, note || null, requestingUser.id, requestingUser.shopId]
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

// Server-side paginated (page/pageSize -> LIMIT/OFFSET), same shape as
// salesService.js's getBilledHistory ({ ..., totalCount, totalPages, page, pageSize }) —
// this is an append-only log with no natural cap (unlike e.g. store-credit vouchers, which
// self-limit to balance > 0), so it's the one Inventory-adjacent list that actually needs
// real server-side pagination rather than a client-side slice over the full history.
//
// Pagination is opt-in, same reasoning as bankPaymentService.js's listIntents/
// contactsService.js's getContacts: scripts/verify-shop-isolation.js (and potentially any
// other future caller wanting "just everything") calls this route with no page param at
// all and expects a plain array back — a JS default parameter (`page = 1`) would have
// applied on every call regardless, since a destructured default fires on `undefined` too;
// this checks for that explicitly before deciding which shape to return.
const listAdjustments = async ({ productId, startDate, endDate, reasonCode, page, pageSize } = {}, shopId) => {
  const params = [shopId];
  const conditions = ["a.shop_id = $1"];
  if (productId) {
    params.push(productId);
    conditions.push(`a.product_id = $${params.length}`);
  }
  if (startDate && endDate) {
    conditions.push(dateRangeCondition(params, "a.adjusted_at", startDate, endDate));
  }
  if (reasonCode) {
    params.push(reasonCode);
    conditions.push(`a.reason_code = $${params.length}`);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  // Shared SELECT — full chain back to the original delivery when the adjustment is
  // against a lot: the lot's own vendor/received date/received-by, not just the
  // adjustment's own attribution — this is what actually answers "where did this specific
  // unit come from, and who accepted it" for a discarded/damaged/expired item, not just
  // "who discarded it."
  const selectSql = `SELECT a.*, p.productname, p.batch_tracked,
            l.lot_code, l.received_at AS lot_received_at,
            u.display_name AS adjusted_by_name,
            vendor.name AS lot_vendor_name,
            receiver.display_name AS lot_received_by_name
     FROM stock_adjustments a
     JOIN products p ON p.id = a.product_id
     LEFT JOIN lots l ON l.id = a.lot_id
     LEFT JOIN contacts vendor ON vendor.id = l.vendor_id
     LEFT JOIN users receiver ON receiver.id = l.received_by`;

  if (page === undefined) {
    const { rows } = await pool.query(`${selectSql} LEFT JOIN users u ON u.id = a.adjusted_by ${where} ORDER BY a.adjusted_at DESC`, params);
    return rows;
  }

  const effectivePageSize = pageSize || 20;
  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM stock_adjustments a ${where}`,
    params
  );
  const totalCount = parseInt(countResult.rows[0].total, 10) || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / effectivePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * effectivePageSize;

  const { rows } = await pool.query(
    `${selectSql}
     LEFT JOIN users u ON u.id = a.adjusted_by
     ${where}
     ORDER BY a.adjusted_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, effectivePageSize, offset]
  );
  return { adjustments: rows, totalCount, totalPages, page: safePage, pageSize: effectivePageSize };
};

// Total units and cost impact of shrinkage (negative adjustments only — a positive
// adjustment is a correction-up/found-stock, not a loss) for the Sales Report's Shrinkage
// section, both overall and broken down by reason/product — this is what finally puts
// shrinkage cost somewhere visible, instead of it silently vanishing from every report.
const getShrinkageSummary = async (startDate, endDate, shopId) => {
  const { rows: totals } = await pool.query(
    `SELECT COALESCE(SUM(-quantity_change), 0) AS total_units_lost,
            COALESCE(SUM(-quantity_change * buying_price), 0) AS total_cost_impact
     FROM stock_adjustments
     WHERE adjusted_at BETWEEN $1 AND $2 AND quantity_change < 0 AND shop_id = $3`,
    [startDate, endDate, shopId]
  );

  const { rows: byReason } = await pool.query(
    `SELECT reason_code,
            SUM(-quantity_change) AS units_lost,
            SUM(-quantity_change * buying_price) AS cost_impact
     FROM stock_adjustments
     WHERE adjusted_at BETWEEN $1 AND $2 AND quantity_change < 0 AND shop_id = $3
     GROUP BY reason_code
     ORDER BY cost_impact DESC`,
    [startDate, endDate, shopId]
  );

  // GROUP BY includes a.shop_id alongside product_id/productname — same fail-safe reasoning
  // as salesService.js's fetchSales: two shops can now share a product name (migration 021),
  // so grouping only by product_id (itself already shop-specific, since a product row only
  // ever belongs to one shop) is actually already safe here — shop_id is added purely for
  // consistency/defense-in-depth with the WHERE filter, not because product_id alone could
  // actually merge two shops' rows.
  const { rows: byProduct } = await pool.query(
    `SELECT a.product_id, p.productname,
            SUM(-a.quantity_change) AS units_lost,
            SUM(-a.quantity_change * a.buying_price) AS cost_impact
     FROM stock_adjustments a
     JOIN products p ON p.id = a.product_id
     WHERE a.adjusted_at BETWEEN $1 AND $2 AND a.quantity_change < 0 AND a.shop_id = $3
     GROUP BY a.product_id, p.productname, a.shop_id
     ORDER BY cost_impact DESC`,
    [startDate, endDate, shopId]
  );

  return {
    totalUnitsLost: Number(totals[0].total_units_lost),
    totalCostImpact: Number(totals[0].total_cost_impact),
    byReason,
    byProduct,
  };
};

module.exports = { REASON_CODES, createAdjustment, listAdjustments, getShrinkageSummary };
