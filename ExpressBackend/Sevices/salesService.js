const { pool } = require("../Db");
const { getLotById, decrementLot } = require("./lotService");
const { getSettings } = require("./settingsService");
const ApiError = require("../utils/ApiError");

// RETURNING * used to be discarded here — nothing on the client ever learned a sale's
// id, which void needs (to reference "this specific sale" right after checkout, not just
// ones already round-tripped through Sales History).
const insertSales = async (sellingPrice, sellingQuantity, product_id, lotId, buyingPrice, soldBy) => {
  try {
    const { rows } = await pool.query(
      `
      INSERT INTO sales (selling_price, quantity, product_id, sale_time, lot_id, buying_price, sold_by)
      VALUES ($1, $2, $3, NOW(), $4, $5, $6)
      RETURNING *;
    `,
      [sellingPrice, sellingQuantity, product_id, lotId, buyingPrice, soldBy]
    );
    return rows[0];
  } catch (err) {
    throw new Error(err.message);
  }
};

const getRecentSales = async () => {
  try {
    // Step 1: Fetch the most recent sale data
    const recentSaleQuery = `
      SELECT 
          s.id, 
          s.selling_price, 
          s.quantity, 
          s.product_id, 
          DATE_TRUNC('second', s.sale_time) AS sale_time,  -- Truncate to seconds
          p.productname
      FROM public.sales s
      JOIN public.products p ON s.product_id = p.id
      WHERE s.is_voided = false
      ORDER BY s.sale_time DESC
      LIMIT 1;  -- Get only the most recent sale
    `;

    // Execute the query to get the most recent sale
    const recentSaleResult = await pool.query(recentSaleQuery);

    // Check if there is any recent sale data
    if (recentSaleResult.rows.length === 0) {
      return {
        message: "No sales data found",
        data: {
          salesData: [],
        },
      };
    }

    // Get the most recent sale's truncated time
    const recentSale = recentSaleResult.rows[0];
    const recentSaleTime = recentSale.sale_time; // This will be in seconds

    // Step 2: Fetch all sales that occurred at the same truncated time
    const sameTimeSalesQuery = `
      SELECT 
          s.id, 
          s.selling_price, 
          s.quantity, 
          s.product_id, 
          s.sale_time,
          p.productname
      FROM public.sales s
      JOIN public.products p ON s.product_id = p.id
      WHERE DATE_TRUNC('second', s.sale_time) = $1  -- Match the truncated time
        AND s.is_voided = false
      ORDER BY s.sale_time DESC;
    `;

    // Execute the query to get all sales at the same second
    const sameTimeSalesResult = await pool.query(sameTimeSalesQuery, [
      recentSaleTime,
    ]);

    // Prepare the response with the recent sales at the same time
    const salesData = sameTimeSalesResult.rows.map((row) => ({
      id: row.id,
      selling_price: row.selling_price,
      quantity: row.quantity,
      product_id: row.product_id,
      sale_time: row.sale_time,
      productname: row.productname,
    }));

    // Return the recent sales data
    return {
      message: "Recent sales fetched successfully",
      data: {
        salesData,
      },
    };
  } catch (error) {
    throw new Error("Error fetching recent sales: " + error.message);
  }
};

const getLowStockThreshold = async () => {
  const settings = await getSettings();
  const threshold = Number(settings.low_stock_threshold);
  return Number.isFinite(threshold) ? threshold : 10;
};

// Sale from a specific, manually-picked lot (batch-tracked products).
// Decrements exactly that lot (and the product's cached total), and snapshots
// the lot's buying price onto the sale so later price changes never rewrite past profit.
const sellFromLot = async (sellingPrice, sellingQuantity, product_id, lotId, soldBy) => {
  const lot = await getLotById(lotId);
  if (!lot) {
    return { messageSend: `Lot not found` };
  }
  if (String(lot.product_id) !== String(product_id)) {
    return { messageSend: `That lot does not belong to this product` };
  }

  let updatedLot;
  try {
    updatedLot = await decrementLot(lotId, sellingQuantity);
  } catch (err) {
    return { messageSend: err.message };
  }

  const sale = await insertSales(sellingPrice, sellingQuantity, product_id, lotId, lot.buying_price, soldBy);

  const { rows } = await pool.query(`SELECT quantity FROM products WHERE id = $1`, [product_id]);
  const updatedQuantity = rows[0].quantity;

  const threshold = await getLowStockThreshold();
  let messageSend = "Sale processed successfully";
  if (updatedQuantity < threshold) {
    messageSend = `Inventory is less than ${threshold}`;
  }

  return { updatedQuantity, messageSend, lotRemaining: updatedLot.qty_remaining, saleId: sale.id };
};

const updateSalesRecord = async (sellingPrice, SellingQuantity, product_id, lotId, soldBy) => {
  try {
    if (lotId) {
      return await sellFromLot(sellingPrice, SellingQuantity, product_id, lotId, soldBy);
    }

    const { rows } = await pool.query(
      `SELECT quantity, buyingprice FROM products WHERE id = $1`,
      [product_id]
    );

    const getQuantity = rows[0].quantity;

    let messageSend = "";
    let updatedQuantity = 0;
    if (isNaN(getQuantity)) {
      throw new Error("Invalid quantity value retrieved from the database");
    }

    if (isNaN(SellingQuantity)) {
      throw new Error("Invalid selling quantity provided");
    }

    if (SellingQuantity > getQuantity) {
      messageSend = "Insufficient inventory to process the sale";

      return { messageSend };
    } else {
      const sale = await insertSales(sellingPrice, SellingQuantity, product_id, null, rows[0].buyingprice, soldBy);

      updatedQuantity = getQuantity - SellingQuantity;

      await pool.query(
        `UPDATE products
         SET quantity = $1
         WHERE id = $2`,
        [updatedQuantity, product_id]
      );

      // Check stock remaining AFTER this sale — not the pre-sale quantity — against the
      // threshold, so the cashier is warned about the level the shelf is actually at now.
      const threshold = await getLowStockThreshold();
      messageSend =
        updatedQuantity < threshold
          ? `Inventory is less than ${threshold}`
          : "Sale processed successfully";

      return { updatedQuantity, messageSend, saleId: sale.id };
    }
  } catch (err) {
    throw new Error(err.message);
  }
};

const DEFAULT_HISTORY_PAGE_SIZE = 30;

// Paginated, optionally date-filtered billed history. A "transaction" is a group of
// sales rows sharing the same sale_time truncated to the second (one checkout). Pagination
// is applied at the transaction level in SQL so a page only ever pulls the rows it needs,
// instead of loading the entire sales table into memory and grouping in JS.
//
// Voided sales are NOT filtered out here (unlike every other read in this file) — this is
// the history a void is meant to preserve, so a voided sale stays visible (the frontend
// renders it struck-through/badged), it just no longer counts in revenue/profit anywhere
// else. viewerFilter is how a Cashier's restricted view (their own sales, today only) is
// applied — same conditions[]/params mechanism already used for date/category, so Sales
// History can be the same route/page for both roles instead of a separate screen.
const fetchBilledHistory = async (
  startDate,
  endDate,
  categoryId,
  page = 1,
  pageSize = DEFAULT_HISTORY_PAGE_SIZE,
  viewerFilter = null, // { soldBy } — when set, restricts to that user's sales from today
  voidStatus = "all" // 'all' | 'voided' | 'confirmed' — a transaction matches if ANY of
  // its line items does (see below), same as the category filter's "any item matches"
  // semantics, so a mixed transaction (one voided line + one active line) shows up under
  // both filters rather than getting hidden from either.
) => {
  try {
    const hasDateFilter =
      startDate && endDate && isValidDate(startDate) && isValidDate(endDate);
    const parsedCategoryId = parseInt(categoryId, 10);
    const hasCategoryFilter = Number.isFinite(parsedCategoryId);

    // A transaction "matches" the category filter if any item in it belongs to that
    // category — the product join is only needed to test that, not to restrict which
    // items are later shown (a matched transaction is still returned in full).
    const conditions = [];
    const params = [];
    if (hasDateFilter) {
      params.push(startDate, endDate);
      conditions.push(`s.sale_time BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    if (hasCategoryFilter) {
      params.push(parsedCategoryId);
      conditions.push(`p.category_id = $${params.length}`);
    }
    if (viewerFilter?.soldBy) {
      params.push(viewerFilter.soldBy);
      conditions.push(`s.sold_by = $${params.length}`);
      conditions.push(`s.sale_time >= CURRENT_DATE`);
    }
    if (voidStatus === "voided") {
      conditions.push(`s.is_voided = true`);
    } else if (voidStatus === "confirmed") {
      conditions.push(`s.is_voided = false`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const joinClause = hasCategoryFilter
      ? "JOIN public.products p ON s.product_id = p.id"
      : "";

    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT DATE_TRUNC('second', s.sale_time)) AS total
       FROM public.sales s
       ${joinClause}
       ${whereClause};`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].total, 10) || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const offset = (safePage - 1) * pageSize;

    const txnResult = await pool.query(
      `SELECT DATE_TRUNC('second', s.sale_time) AS txn_time
       FROM public.sales s
       ${joinClause}
       ${whereClause}
       GROUP BY txn_time
       ORDER BY txn_time DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2};`,
      [...params, pageSize, offset]
    );
    const txnTimes = txnResult.rows.map((row) => row.txn_time);

    if (txnTimes.length === 0) {
      return { batches: [], totalCount, totalPages, page: safePage, pageSize };
    }

    const rowsResult = await pool.query(
      `SELECT s.id, s.selling_price, s.buying_price, s.quantity, s.sale_time, s.product_id,
              s.sold_by, s.is_voided, s.voided_at, s.void_reason,
              p.productname, l.lot_code
       FROM public.sales s
       JOIN public.products p ON s.product_id = p.id
       LEFT JOIN public.lots l ON s.lot_id = l.id
       WHERE DATE_TRUNC('second', s.sale_time) = ANY($1::timestamp[])
       ORDER BY DATE_TRUNC('second', s.sale_time) DESC, s.id ASC;`,
      [txnTimes]
    );

    // Bucket rows by their truncated sale_time, then rebuild in the same DESC order as txnTimes
    const batchesByTime = new Map();
    rowsResult.rows.forEach((row) => {
      const key = row.sale_time.toISOString().slice(0, 19);
      if (!batchesByTime.has(key)) batchesByTime.set(key, []);
      batchesByTime.get(key).push({
        id: row.id,
        selling_price: row.selling_price,
        buying_price: row.buying_price,
        quantity: row.quantity,
        sale_time: row.sale_time,
        product_id: row.product_id,
        productname: row.productname,
        // Which lot this unit was sold out of, when the product is lot-tracked
        lot_code: row.lot_code,
        sold_by: row.sold_by,
        is_voided: row.is_voided,
        voided_at: row.voided_at,
        void_reason: row.void_reason,
      });
    });

    const batches = txnTimes
      .map((t) => batchesByTime.get(t.toISOString().slice(0, 19)))
      .filter(Boolean);

    return { batches, totalCount, totalPages, page: safePage, pageSize };
  } catch (err) {
    console.log(err);
    throw new Error(err.message);
  }
};

const isValidDate = (date) => {
  return !isNaN(new Date(date).getTime());
};

// Reverses a sale: restores stock and marks it voided — never deletes or overwrites the
// original row's own fields (same append-only philosophy as party_transactions). Who's
// allowed to void what is enforced here, not just via route middleware, since the rule is
// conditional (Owner: anything, any time; Cashier: only their own sale, only same-day) —
// requireAuth/requireOwner alone can't express that.
const voidSale = async (saleId, requestingUser, reason) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(`SELECT * FROM sales WHERE id = $1 FOR UPDATE`, [saleId]);
    const sale = rows[0];
    if (!sale) throw new ApiError(404, "Sale not found");
    if (sale.is_voided) throw new ApiError(409, "This sale has already been voided");

    if (requestingUser.role !== "owner") {
      const { rows: dateCheck } = await client.query(
        `SELECT DATE(sale_time) = CURRENT_DATE AS is_today FROM sales WHERE id = $1`,
        [saleId]
      );
      const isOwnSale = String(sale.sold_by) === String(requestingUser.id);
      const isToday = dateCheck[0]?.is_today;
      if (!isOwnSale || !isToday) {
        throw new ApiError(403, "You can only void your own sales from today");
      }
    }

    // Restore stock — mirrors decrementLot/the plain-product path in reverse. Skipped
    // (but the sale is still marked voided) if the product/lot was since deleted — can't
    // restore stock to inventory that no longer exists.
    if (sale.lot_id) {
      const { rows: lotRows } = await client.query(`SELECT * FROM lots WHERE id = $1`, [sale.lot_id]);
      if (lotRows[0]) {
        await client.query(`UPDATE lots SET qty_remaining = qty_remaining + $2 WHERE id = $1`, [
          sale.lot_id,
          sale.quantity,
        ]);
        await client.query(`UPDATE products SET quantity = quantity + $2 WHERE id = $1`, [
          lotRows[0].product_id,
          sale.quantity,
        ]);
      }
    } else if (sale.product_id) {
      // A 0 rowCount here (product since deleted) is fine — nothing to restore, and the
      // sale still gets marked voided below regardless.
      await client.query(`UPDATE products SET quantity = quantity + $2 WHERE id = $1`, [
        sale.product_id,
        sale.quantity,
      ]);
    }

    const { rows: updated } = await client.query(
      `UPDATE sales
       SET is_voided = true, voided_at = NOW(), void_reason = $2, voided_by = $3
       WHERE id = $1
       RETURNING *`,
      [saleId, reason || null, requestingUser.id]
    );

    await client.query("COMMIT");
    return updated[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

const fetchSales = async (startDate, endDate) => {
  try {
    // Validate date inputs
    if (
      !startDate ||
      !endDate ||
      !isValidDate(startDate) ||
      !isValidDate(endDate)
    ) {
      throw new Error(
        "Invalid date inputs. Please provide valid start and end dates."
      );
    }

    // Query to fetch product sales, calculate profit/loss, include buying price, and category.
    // Costs are sourced from sales.buying_price — the price snapshotted at the moment each
    // sale happened — not the product's current price, so past profit never shifts when a
    // product's/lot's price changes later.
    const response = await pool.query(
      `SELECT
         p.productname,
         p.category_id,
         c.category_name,  -- Fetch category name from the categories table
         CAST(AVG(s.buying_price) AS INT) AS buyingprice,  -- avg cost actually paid across the sold units
         SUM(s.quantity) AS total_quantity_sold,
         CAST(AVG(s.selling_price) AS INT) AS avg_selling_price,  -- Cast average selling price to INT
         CAST(AVG(s.selling_price - s.buying_price) AS INT) AS profit_loss,  -- Profit per piece as INT
         SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT AS overall_profit_loss  -- Total profit as BIGINT
       FROM Sales s
       INNER JOIN Products p ON s.product_id = p.id
       INNER JOIN Categories c ON p.category_id = c.id  -- Join with Categories table to get category name
       WHERE s.sale_time BETWEEN $1 AND $2 AND s.is_voided = false
       GROUP BY p.productname, p.category_id, c.category_name  -- Group by necessary columns including category name
       ORDER BY profit_loss DESC`,
      [startDate, endDate]
    );

    // Extract sales data rows
    const salesData = response.rows;

    // Calculate the overall total profit/loss for all products
    const totalProfitLoss = salesData.reduce((acc, item) => {
      return acc + parseFloat(item.overall_profit_loss); // Convert overall_profit_loss to a number
    }, 0);

    // Return both sales data and total profit/loss
    return {
      salesData, // Product-wise profit/loss with category, buying price, and overall profit
      totalProfitLoss, // Total profit/loss for the specified timeframe
    };
  } catch (err) {
    console.log(err);
    throw err; // Ensure to throw the error to be caught in your controller
  }
};

const fetchSalesByProfitLoss = async (startDate, endDate, type) => {
  try {
    // Validate date inputs
    if (
      !startDate ||
      !endDate ||
      !isValidDate(startDate) ||
      !isValidDate(endDate)
    ) {
      throw new Error(
        "Invalid date inputs. Please provide valid start and end dates."
      );
    }

    // Determine the profit condition based on the type
    let profitCondition;
    if (type === "profit") {
      profitCondition = "SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT > 0"; // Show only positive overall profit
    } else if (type === "loss") {
      profitCondition = "SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT < 0"; // Show only negative overall profit
    } else {
      throw new Error("Invalid type. Must be 'profit' or 'loss'.");
    }

    const response = await pool.query(
      `SELECT
         p.productname,
         p.category_id,
         c.category_name,
         CAST(AVG(s.buying_price) AS INT) AS buyingprice,  -- avg cost actually paid across the sold units
         SUM(s.quantity) AS total_quantity_sold,
         CAST(AVG(s.selling_price) AS INT) AS avg_selling_price,  -- Cast average selling price to INT
         CAST(AVG(s.selling_price - s.buying_price) AS INT) AS profit_loss,  -- Profit per piece as INT
         SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT AS overall_profit_loss  -- Total profit as BIGINT
       FROM Sales s
       INNER JOIN Products p ON s.product_id = p.id
       INNER JOIN Categories c ON p.category_id = c.id
       WHERE s.sale_time BETWEEN $1 AND $2 AND s.is_voided = false
       GROUP BY p.productname, p.category_id, c.category_name  -- Group by product name and category
       HAVING ${profitCondition} -- Apply the profit condition for profit-only items
       ORDER BY overall_profit_loss DESC`,
      [startDate, endDate]
    );

    // Extract sales data rows
    const salesData = response.rows;

    // Calculate the overall total profit/loss for the filtered products
    const totalProfitLoss = salesData.reduce((acc, item) => {
      return acc + parseFloat(item.overall_profit_loss); // Convert overall_profit to a number
    }, 0);

    // Return both the sales data and the total profit/loss
    return {
      salesData, // Product-wise profit/loss including buying price
      totalProfitLoss, // Total profit/loss for the specified timeframe and type
    };
  } catch (err) {
    console.log(err);
    throw err; // Ensure to throw the error to be caught in your controller
  }
};

// Daily revenue/profit/units within a date range — powers the Sales Report trend chart.
const fetchSalesTimeSeries = async (startDate, endDate) => {
  if (!startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
    throw new Error("Invalid date inputs. Please provide valid start and end dates.");
  }

  const response = await pool.query(
    `SELECT
       DATE_TRUNC('day', s.sale_time) AS day,
       SUM(s.quantity * s.selling_price)::BIGINT AS revenue,
       SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT AS profit,
       SUM(s.quantity)::BIGINT AS units
     FROM Sales s
     WHERE s.sale_time BETWEEN $1 AND $2 AND s.is_voided = false
     GROUP BY day
     ORDER BY day`,
    [startDate, endDate]
  );

  return response.rows;
};

module.exports = {
  updateSalesRecord,
  fetchSales,
  fetchSalesByProfitLoss,
  fetchSalesTimeSeries,
  getRecentSales,
  fetchBilledHistory,
  voidSale,
};
