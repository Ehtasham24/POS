const { pool } = require("../Db");
const { getSettings, getBusinessTimezone } = require("./settingsService");
const storeCreditService = require("./storeCreditService");
const ApiError = require("../utils/ApiError");

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

// null = unlimited (the default — no setting means no age restriction on refunds, Owner/
// staff discretion). Mirrors getLowStockThreshold's read-from-settings shape.
const getRefundWindowDays = async () => {
  const settings = await getSettings();
  const days = Number(settings.refund_window_days);
  return Number.isFinite(days) && days > 0 ? days : null;
};

// Receipt numbers are just the sale_transactions row's SERIAL id, formatted — Postgres
// allocates that atomically under concurrency by design (same guarantee sales.id/users.id
// already rely on elsewhere in this file), so there's no custom counter/locking logic that
// could produce a duplicate. Formatting is applied at read/display time only, never stored,
// so the prefix/padding can change later without having to reformat historical receipts.
const RECEIPT_PREFIX = "RCPT-";
const formatReceiptNo = (transactionId) =>
  transactionId ? `${RECEIPT_PREFIX}${String(transactionId).padStart(6, "0")}` : null;

// Same idea, same robustness rationale (refunds.id is a SERIAL, allocated atomically by
// Postgres) — just its own prefix so a refund slip is visibly distinct from a sale receipt.
const REFUND_PREFIX = "REF-";
const formatRefundNo = (refundId) =>
  refundId ? `${REFUND_PREFIX}${String(refundId).padStart(6, "0")}` : null;

// Checkout: atomically creates one sale_transactions row (the receipt) plus one sales row
// per cart item, all inside a single DB transaction — either the whole cart sells or none of
// it does. Replaces the old pattern (still available via updateSalesRecord/insertSales below,
// used by the standalone /sales route) where the frontend fired one independent request per
// cart item with no server-side concept of "these rows are one checkout" — which left nothing
// reliable for a receipt number to anchor to, and nothing a future refund could reference
// unambiguously. sale_transactions IS that anchor now; a refund feature would later reference
// its id (whole-receipt) and/or a sale's own id (single line-item) directly, no guessing at
// which rows belong together the way fetchBilledHistory's legacy grouping still has to.
//
// Self-contained (doesn't call sellFromLot/updateSalesRecord/insertSales) so the existing
// single-item /sales route and its callers are completely untouched by this — same stock-
// check-and-decrement logic as decrementLot/updateSalesRecord, just re-expressed against this
// transaction's client with FOR UPDATE row locks (mirrors voidSale's own inline-SQL style,
// same reason: the mutation has to happen against `client`, not the module-level `pool`, to
// actually be part of the same transaction).
// voucherCode/storeCreditRedeemed are both optional — when omitted (every anonymous walk-in
// sale, still the vast majority), checkout behaves exactly as it did before store credit
// existed: store_credit_applied stays its 0 default. Redemption is a mixed/split payment, not
// all-or-nothing — it covers as much of the cart as is available, paymentMethod covers
// whatever remains (e.g. Rs.800 cart, Rs.300 credit applied still records payment_method:
// 'cash' for the remaining Rs.500). No customer identity involved anywhere here — see
// migrations/011_store_credit_vouchers.sql: redemption works by the voucher's own code, not
// by who's making the purchase.
const checkoutSale = async (items, paymentMethod, requestingUser, { voucherCode, storeCreditRedeemed } = {}) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "Cart is empty");
  }

  const cartTotal = items.reduce((sum, i) => sum + i.sellingPrice * i.quantity, 0);
  // Capped at the cart's own total — redeeming can't produce cash back, only reduce what's
  // owed. The actual balance check happens inside storeCreditService.redeemVoucher below,
  // inside the same transaction.
  const creditToApply =
    storeCreditRedeemed > 0 ? Math.min(Number(storeCreditRedeemed), cartTotal) : 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // requestingUser can be null here — the notification-forwarder auto-matcher
    // (Sevices/PaymentNotifications/matchingService.js) confirms a bank-transfer intent
    // with no logged-in staff behind it at all. sold_by is nullable for exactly this
    // reason (see migrations/006_users_and_auth.sql's own comment on nullable sold_by).
    const { rows: txnRows } = await client.query(
      `INSERT INTO sale_transactions (sold_by, payment_method, store_credit_applied)
       VALUES ($1, $2, $3) RETURNING id`,
      [requestingUser?.id || null, paymentMethod || null, creditToApply]
    );
    const transactionId = txnRows[0].id;

    if (creditToApply > 0) {
      await storeCreditService.redeemVoucher(client, {
        code: voucherCode,
        amount: creditToApply,
        transactionId,
        requestingUser,
      });
    }

    const threshold = await getLowStockThreshold();

    const soldItems = [];
    for (const item of items) {
      const { sellingPrice, quantity, productID, lotId } = item;
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new ApiError(400, `Invalid quantity for product ${productID}`);
      }

      let buyingPrice;
      if (lotId) {
        const { rows: lotRows } = await client.query(
          `SELECT * FROM lots WHERE id = $1 FOR UPDATE`,
          [lotId]
        );
        const lot = lotRows[0];
        if (!lot) throw new ApiError(404, `Lot not found for product ${productID}`);
        if (String(lot.product_id) !== String(productID)) {
          throw new ApiError(400, `That lot does not belong to product ${productID}`);
        }
        if (qty > lot.qty_remaining) {
          throw new ApiError(
            409,
            `Insufficient stock in lot ${lot.lot_code} (${lot.qty_remaining} remaining)`
          );
        }
        await client.query(`UPDATE lots SET qty_remaining = qty_remaining - $2 WHERE id = $1`, [
          lotId,
          qty,
        ]);
        await client.query(`UPDATE products SET quantity = quantity - $2 WHERE id = $1`, [
          productID,
          qty,
        ]);
        buyingPrice = lot.buying_price;
      } else {
        const { rows: productRows } = await client.query(
          `SELECT quantity, buyingprice FROM products WHERE id = $1 FOR UPDATE`,
          [productID]
        );
        const product = productRows[0];
        if (!product) throw new ApiError(404, `Product ${productID} not found`);
        if (qty > product.quantity) {
          throw new ApiError(409, `Insufficient inventory for product ${productID}`);
        }
        await client.query(`UPDATE products SET quantity = quantity - $2 WHERE id = $1`, [
          productID,
          qty,
        ]);
        buyingPrice = product.buyingprice;
      }

      const { rows: saleRows } = await client.query(
        `INSERT INTO sales (selling_price, quantity, product_id, sale_time, lot_id, buying_price, sold_by, transaction_id)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
         RETURNING id`,
        [sellingPrice, qty, productID, lotId || null, buyingPrice, requestingUser?.id || null, transactionId]
      );

      const { rows: afterRows } = await client.query(`SELECT quantity FROM products WHERE id = $1`, [
        productID,
      ]);
      const updatedQuantity = afterRows[0].quantity;

      soldItems.push({
        saleId: saleRows[0].id,
        productID,
        quantity: qty,
        sellingPrice,
        updatedQuantity,
        lowStock: updatedQuantity < threshold,
      });
    }

    await client.query("COMMIT");

    return {
      transactionId,
      receiptNo: formatReceiptNo(transactionId),
      items: soldItems,
      total: cartTotal,
      creditApplied: creditToApply,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err instanceof ApiError ? err : new ApiError(500, err.message);
  } finally {
    client.release();
  }
};

const DEFAULT_HISTORY_PAGE_SIZE = 30;

// Paginated, optionally date-filtered billed history. A "transaction" (one checkout) is
// grouped by sales.transaction_id where it's set (every sale since sale_transactions/
// checkoutSale shipped); rows from before that migration have no transaction_id, so they
// fall back to the old heuristic — sharing the same sale_time truncated to the second — so
// pre-existing history keeps grouping the same way it always did rather than each of those
// rows suddenly appearing as its own single-item "transaction". The batch_key expression
// below implements that fallback directly in SQL (COALESCE onto the legacy grouping), so
// pagination can stay applied at the transaction level for both old and new rows uniformly,
// instead of loading the entire sales table into memory and grouping in JS.
//
// Voided sales are NOT filtered out here (unlike every other read in this file) — this is
// the history a void is meant to preserve, so a voided sale stays visible (the frontend
// renders it struck-through/badged), it just no longer counts in revenue/profit anywhere
// else. viewerFilter is how a Cashier's restricted view (their own sales, today only) is
// applied — same conditions[]/params mechanism already used for date/category, so Sales
// History can be the same route/page for both roles instead of a separate screen.
const BATCH_KEY_EXPR =
  "COALESCE('txn-' || s.transaction_id::text, 'legacy-' || DATE_TRUNC('second', s.sale_time)::text)";
const fetchBilledHistory = async (
  startDate,
  endDate,
  categoryId,
  page = 1,
  pageSize = DEFAULT_HISTORY_PAGE_SIZE,
  viewerFilter = null, // { soldBy } — when set, restricts to that user's sales from today
  voidStatus = "all", // 'all' | 'voided' | 'confirmed' — a transaction matches if ANY of
  // its line items does (see below), same as the category filter's "any item matches"
  // semantics, so a mixed transaction (one voided line + one active line) shows up under
  // both filters rather than getting hidden from either.
  receiptNo = null, // e.g. "RCPT-000123" — the receipt-number lookup a refund flow starts
  // from; parsed back to the raw transaction_id and matched exactly, no new endpoint needed
  // since this reuses the same conditions[]/params mechanism as every other filter here.
  paymentMethod = null // 'cash' | 'card' | 'bank_transfer' — filters by the whole
  // transaction's payment medium (sale_transactions.payment_method), not a per-item field.
) => {
  try {
    const hasDateFilter =
      startDate && endDate && isValidDate(startDate) && isValidDate(endDate);
    const parsedCategoryId = parseInt(categoryId, 10);
    const hasCategoryFilter = Number.isFinite(parsedCategoryId);
    const parsedTransactionId = receiptNo
      ? parseInt(String(receiptNo).replace(/^RCPT-/i, ""), 10)
      : NaN;
    const hasReceiptFilter = Number.isFinite(parsedTransactionId);
    const hasPaymentMethodFilter = ["cash", "card", "bank_transfer"].includes(paymentMethod);

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
      // "Today" here means today in the shop's own configured timezone, not Postgres's
      // session timezone (UTC) — CURRENT_DATE would silently use the wrong calendar day for
      // several hours around each UTC midnight (e.g. a sale at 1am PKT is still "yesterday"
      // in UTC). sale_time is stored as a naive timestamp that's actually UTC (session
      // timezone is UTC — see Db.js's type-parser comment), so `AT TIME ZONE 'UTC'` first
      // makes that explicit before converting into the business timezone for the comparison.
      const businessTimezone = await getBusinessTimezone();
      params.push(businessTimezone);
      conditions.push(
        `(s.sale_time AT TIME ZONE 'UTC') AT TIME ZONE $${params.length} >= date_trunc('day', NOW() AT TIME ZONE $${params.length})`
      );
    }
    if (voidStatus === "voided") {
      conditions.push(`s.is_voided = true`);
    } else if (voidStatus === "confirmed") {
      conditions.push(`s.is_voided = false`);
    }
    if (hasReceiptFilter) {
      params.push(parsedTransactionId);
      conditions.push(`s.transaction_id = $${params.length}`);
    }
    if (hasPaymentMethodFilter) {
      params.push(paymentMethod);
      conditions.push(`st.payment_method = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const joinClause = hasCategoryFilter
      ? "JOIN public.products p ON s.product_id = p.id"
      : "";
    // Only needed in these two queries when actually filtering by it — the final
    // rows-fetching query below already joins sale_transactions unconditionally, for
    // store_credit_applied/payment_method regardless of whether this filter is active.
    const stJoinClause = hasPaymentMethodFilter
      ? "LEFT JOIN public.sale_transactions st ON st.id = s.transaction_id"
      : "";

    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT ${BATCH_KEY_EXPR}) AS total
       FROM public.sales s
       ${joinClause}
       ${stJoinClause}
       ${whereClause};`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].total, 10) || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const offset = (safePage - 1) * pageSize;

    const txnResult = await pool.query(
      `SELECT ${BATCH_KEY_EXPR} AS batch_key, MAX(s.sale_time) AS batch_time
       FROM public.sales s
       ${joinClause}
       ${stJoinClause}
       ${whereClause}
       GROUP BY batch_key
       ORDER BY batch_time DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2};`,
      [...params, pageSize, offset]
    );
    const batchKeys = txnResult.rows.map((row) => row.batch_key);

    if (batchKeys.length === 0) {
      return { batches: [], totalCount, totalPages, page: safePage, pageSize };
    }

    const rowsResult = await pool.query(
      `SELECT s.id, s.selling_price, s.buying_price, s.quantity, s.sale_time, s.product_id,
              s.sold_by, s.is_voided, s.voided_at, s.void_reason, s.transaction_id,
              ${BATCH_KEY_EXPR} AS batch_key,
              p.productname, l.lot_code,
              COALESCE((SELECT SUM(r.quantity) FROM refunds r WHERE r.sale_id = s.id), 0) AS refunded_quantity,
              st.store_credit_applied, st.payment_method
       FROM public.sales s
       JOIN public.products p ON s.product_id = p.id
       LEFT JOIN public.lots l ON s.lot_id = l.id
       LEFT JOIN public.sale_transactions st ON st.id = s.transaction_id
       WHERE ${BATCH_KEY_EXPR} = ANY($1::text[])
       ORDER BY s.sale_time DESC, s.id ASC;`,
      [batchKeys]
    );

    // Bucket rows by the SAME batch_key Postgres just computed above — not a JS
    // reimplementation of that expression. A JS-side re-derivation (transaction_id where
    // set, else re-truncating row.sale_time) looked equivalent but wasn't: pg parses
    // `timestamp without time zone` into a JS Date by assuming the driver's local
    // timezone, so re-serializing it in JS (toISOString(), UTC) came out shifted by
    // whatever that offset is versus Postgres's own naive DATE_TRUNC(...)::text — every
    // legacy batch's JS-side key silently failed to match its SQL-side key, so it never
    // got bucketed. Reusing the one string Postgres already produced sidesteps that
    // entirely — there's only one place batch_key is ever formatted now.
    const batchesByKey = new Map();
    rowsResult.rows.forEach((row) => {
      const key = row.batch_key;
      if (!batchesByKey.has(key)) batchesByKey.set(key, []);
      batchesByKey.get(key).push({
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
        transaction_id: row.transaction_id,
        // null for legacy (pre-receipt-number) batches — the frontend shows nothing/a
        // dash there rather than fabricate a number for sales that never got one.
        receipt_no: formatReceiptNo(row.transaction_id),
        // How much of THIS line item has already been refunded — always derived fresh from
        // the refunds table (see refundSale), never a cached flag on sales itself.
        refunded_quantity: Number(row.refunded_quantity),
        // Same value on every row in a batch (it belongs to the whole transaction, not the
        // line item) — null for legacy sales with no transaction_id, same as receipt_no.
        store_credit_applied: row.store_credit_applied != null ? Number(row.store_credit_applied) : 0,
        // 'cash' | 'card' | 'bank_transfer' | null (legacy sales with no transaction_id).
        payment_method: row.payment_method,
      });
    });

    const batches = batchKeys.map((key) => batchesByKey.get(key)).filter(Boolean);

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

    // Once any part of a sale has been refunded, it's no longer a same-day "this never
    // happened" correction — void and refund are kept non-overlapping (see refundSale below)
    // so any remaining quantity has to go through refund instead.
    const { rows: refundCheck } = await client.query(
      `SELECT 1 FROM refunds WHERE sale_id = $1 LIMIT 1`,
      [saleId]
    );
    if (refundCheck[0]) {
      throw new ApiError(409, "This sale has a refund on record — void isn't available once part of it has been refunded");
    }

    if (requestingUser.role !== "owner") {
      // Business-timezone-aware "today" — same reasoning as fetchBilledHistory's cashier
      // filter above: Postgres's own CURRENT_DATE is the UTC calendar day, which disagrees
      // with the shop's actual day for several hours around each UTC midnight.
      const businessTimezone = await getBusinessTimezone();
      const { rows: dateCheck } = await client.query(
        `SELECT date_trunc('day', (sale_time AT TIME ZONE 'UTC') AT TIME ZONE $2)
                = date_trunc('day', NOW() AT TIME ZONE $2) AS is_today
         FROM sales WHERE id = $1`,
        [saleId, businessTimezone]
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

const REFUND_METHODS = ["cash", "card", "store_credit"];
const REFUND_CONDITIONS = ["resellable", "damaged"];

// Reverses part or all of a sale that genuinely happened — unlike void, the original sale row
// is never touched (no flag, no field changes): it really was revenue on its day, so it stays
// exactly as recorded. "How much has been refunded so far" is derived from SUM(refunds.quantity)
// on every call, never cached, so there's nothing to keep in sync or get wrong. Any logged-in
// staff can refund any sale, any day (no same-day/own-sale rule like void has) — refunds
// routinely happen well after the original sale, by whoever's on shift, per the confirmed
// design decision.
const refundSale = async (
  saleId,
  { quantity, refundAmount, refundMethod, condition, reason, contactId },
  requestingUser
) => {
  if (!reason || !String(reason).trim()) throw new ApiError(400, "A reason is required for a refund");
  if (!REFUND_METHODS.includes(refundMethod)) throw new ApiError(400, "Invalid refund method");
  if (!REFUND_CONDITIONS.includes(condition)) throw new ApiError(400, "Invalid item condition");
  // contactId is always optional (gift-voucher model — see migrations/011_store_credit_
  // vouchers.sql): a store-credit refund never needs a customer identified to be issued.
  // When provided, it's purely for the owner's own tracking (shows up on the Store Credit
  // page), not required for redemption, which always works by the refund's own number.
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new ApiError(400, "Invalid refund quantity");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Locking the sale row is what makes two concurrent refund attempts on the SAME sale
    // serialize correctly — the second transaction's FOR UPDATE blocks until the first
    // commits, and under Postgres's read-committed default, this transaction's next read of
    // `refunds` (below) sees that committed row. A FOR UPDATE directly on a SUM(...) query
    // isn't valid SQL — Postgres can't lock rows an aggregate doesn't return 1:1 with — so
    // the lock has to live here, exactly like voidSale does for the same reason.
    const { rows } = await client.query(`SELECT * FROM sales WHERE id = $1 FOR UPDATE`, [saleId]);
    const sale = rows[0];
    if (!sale) throw new ApiError(404, "Sale not found");
    if (sale.is_voided) throw new ApiError(409, "This sale was voided — nothing to refund");

    const windowDays = await getRefundWindowDays();
    if (windowDays != null) {
      const { rows: ageCheck } = await client.query(
        `SELECT (NOW() - sale_time) > ($2 || ' days')::interval AS expired FROM sales WHERE id = $1`,
        [saleId, windowDays]
      );
      if (ageCheck[0]?.expired) {
        throw new ApiError(403, `This sale is older than the ${windowDays}-day refund window`);
      }
    }

    const { rows: refundedRows } = await client.query(
      `SELECT COALESCE(SUM(quantity), 0) AS refunded FROM refunds WHERE sale_id = $1`,
      [saleId]
    );
    const remaining = sale.quantity - Number(refundedRows[0].refunded);
    if (qty > remaining) {
      throw new ApiError(409, `Only ${remaining} unit(s) of this sale remain refundable`);
    }

    // Amount actually paid back — defaults to the full proportional price, but can be
    // reduced (a goodwill/partial refund) down to >0. Never allowed above what was actually
    // paid for that many units.
    const maxAmount = qty * Number(sale.selling_price);
    const amount = refundAmount != null ? Number(refundAmount) : maxAmount;
    if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount) {
      throw new ApiError(400, `Refund amount must be between 0 and ${maxAmount}`);
    }

    // Restore stock only if the returned item is resellable — mirrors voidSale's
    // lot-then-plain-product restore logic (and its same skip-if-since-deleted defensiveness),
    // reused verbatim rather than factored out, matching how voidSale itself already
    // duplicates this shape instead of calling into lotService.
    if (condition === "resellable") {
      if (sale.lot_id) {
        const { rows: lotRows } = await client.query(`SELECT * FROM lots WHERE id = $1`, [sale.lot_id]);
        if (lotRows[0]) {
          await client.query(`UPDATE lots SET qty_remaining = qty_remaining + $2 WHERE id = $1`, [
            sale.lot_id,
            qty,
          ]);
          await client.query(`UPDATE products SET quantity = quantity + $2 WHERE id = $1`, [
            lotRows[0].product_id,
            qty,
          ]);
        }
      } else if (sale.product_id) {
        await client.query(`UPDATE products SET quantity = quantity + $2 WHERE id = $1`, [
          sale.product_id,
          qty,
        ]);
      }
    }

    // When refundMethod is store_credit, this row IS the voucher — its own refund_amount is
    // the initial value, its own id (formatted below as REF-XXXXXX) is the redemption code.
    // No separate "issue" step needed (see storeCreditService.js / migrations/011).
    const { rows: inserted } = await client.query(
      `INSERT INTO refunds (sale_id, transaction_id, quantity, refund_amount, refund_method, condition, reason, refunded_by, contact_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [saleId, sale.transaction_id, qty, amount, refundMethod, condition, reason, requestingUser.id, contactId || null]
    );

    await client.query("COMMIT");
    return {
      refund: inserted[0],
      refundNo: formatRefundNo(inserted[0].id),
      remainingAfter: remaining - qty,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err instanceof ApiError ? err : new ApiError(500, err.message);
  } finally {
    client.release();
  }
};

const PAYMENT_METHODS = ["cash", "card", "bank_transfer"];

const fetchSales = async (startDate, endDate, paymentMethod = null) => {
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
    //
    // Sources from sales_ledger (migrations/009_refunds.sql), not the raw sales table: it
    // already excludes voided sales (same as before) AND folds in every refund as a negative-
    // quantity row dated on its OWN event_time — a refund reduces revenue/profit on the day
    // it actually happens, not retroactively on the original sale's day. quantity/selling_
    // price/buying_price mean the same thing on both branches of the view, so every SUM/AVG
    // below keeps working unchanged; a refund's negative quantity does the subtraction for
    // free. LEFT JOINs sale_transactions (migrations/015) to optionally filter by payment
    // medium — legacy sales with no transaction_id simply never match a specific medium.
    const response = await pool.query(
      `SELECT
         p.productname,
         p.category_id,
         c.category_name,  -- Fetch category name from the categories table
         CAST(AVG(s.buying_price) AS INT) AS buyingprice,  -- avg cost actually paid across the sold units
         SUM(s.quantity) AS total_quantity_sold,
         CAST(AVG(s.selling_price) AS INT) AS avg_selling_price,  -- Cast average selling price to INT
         -- Quantity-weighted (total profit / total units), not a plain AVG across rows —
         -- a plain average gives every sale EVENT equal weight regardless of quantity, so
         -- a couple of low-quantity, deeply-discounted/clearance sales could pull this
         -- negative even while the bulk of real volume sold at a healthy margin, making it
         -- contradict the (correctly weighted) overall_profit_loss's sign right next to it.
         CAST(SUM(s.quantity * (s.selling_price - s.buying_price)) / NULLIF(SUM(s.quantity), 0) AS INT) AS profit_loss,
         SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT AS overall_profit_loss  -- Total profit as BIGINT
       FROM sales_ledger s
       INNER JOIN Products p ON s.product_id = p.id
       INNER JOIN Categories c ON p.category_id = c.id  -- Join with Categories table to get category name
       LEFT JOIN sale_transactions st ON st.id = s.transaction_id
       WHERE s.event_time BETWEEN $1 AND $2
         AND ($3::text IS NULL OR st.payment_method = $3)
       GROUP BY p.productname, p.category_id, c.category_name  -- Group by necessary columns including category name
       ORDER BY profit_loss DESC`,
      [startDate, endDate, PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : null]
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

const fetchSalesByProfitLoss = async (startDate, endDate, type, paymentMethod = null) => {
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

    // Sources from sales_ledger, same reasoning as fetchSales above — voided sales already
    // excluded, refunds folded in as negative-quantity rows dated on their own event_time.
    const response = await pool.query(
      `SELECT
         p.productname,
         p.category_id,
         c.category_name,
         CAST(AVG(s.buying_price) AS INT) AS buyingprice,  -- avg cost actually paid across the sold units
         SUM(s.quantity) AS total_quantity_sold,
         CAST(AVG(s.selling_price) AS INT) AS avg_selling_price,  -- Cast average selling price to INT
         -- Quantity-weighted (total profit / total units), not a plain AVG across rows —
         -- a plain average gives every sale EVENT equal weight regardless of quantity, so
         -- a couple of low-quantity, deeply-discounted/clearance sales could pull this
         -- negative even while the bulk of real volume sold at a healthy margin, making it
         -- contradict the (correctly weighted) overall_profit_loss's sign right next to it.
         CAST(SUM(s.quantity * (s.selling_price - s.buying_price)) / NULLIF(SUM(s.quantity), 0) AS INT) AS profit_loss,
         SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT AS overall_profit_loss  -- Total profit as BIGINT
       FROM sales_ledger s
       INNER JOIN Products p ON s.product_id = p.id
       INNER JOIN Categories c ON p.category_id = c.id
       LEFT JOIN sale_transactions st ON st.id = s.transaction_id
       WHERE s.event_time BETWEEN $1 AND $2
         AND ($3::text IS NULL OR st.payment_method = $3)
       GROUP BY p.productname, p.category_id, c.category_name  -- Group by product name and category
       HAVING ${profitCondition} -- Apply the profit condition for profit-only items
       ORDER BY overall_profit_loss DESC`,
      [startDate, endDate, PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : null]
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
const fetchSalesTimeSeries = async (startDate, endDate, paymentMethod = null) => {
  if (!startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
    throw new Error("Invalid date inputs. Please provide valid start and end dates.");
  }

  // Sources from sales_ledger, same reasoning as fetchSales above — a refund lands on its
  // OWN day here (negative units/revenue/profit that day), not retroactively on the day of
  // the original sale. Grouped by day in the business timezone (not Postgres's UTC session
  // timezone) so the chart's day buckets agree with what a human looking at the shop's clock
  // would call "today" — same AT TIME ZONE reasoning as fetchBilledHistory's cashier filter.
  const businessTimezone = await getBusinessTimezone();
  const response = await pool.query(
    `SELECT
       date_trunc('day', (s.event_time AT TIME ZONE 'UTC') AT TIME ZONE $3) AS day,
       SUM(s.quantity * s.selling_price)::BIGINT AS revenue,
       SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT AS profit,
       SUM(s.quantity)::BIGINT AS units
     FROM sales_ledger s
     LEFT JOIN sale_transactions st ON st.id = s.transaction_id
     WHERE s.event_time BETWEEN $1 AND $2
       AND ($4::text IS NULL OR st.payment_method = $4)
     GROUP BY day
     ORDER BY day`,
    [startDate, endDate, businessTimezone, PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : null]
  );

  return response.rows;
};

// Cash/card/bank-transfer totals for a date range — powers both the Sales Report's summary
// cards and the Payment Mediums page's, one function reused rather than duplicated. Revenue
// (quantity * selling_price), not profit — a payment-medium breakdown is about how money
// came in, which fetchSales/fetchSalesByProfitLoss's profit-per-product view doesn't answer.
const fetchPaymentMediumTotals = async (startDate, endDate) => {
  if (!startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
    throw new Error("Invalid date inputs. Please provide valid start and end dates.");
  }
  const response = await pool.query(
    `SELECT COALESCE(st.payment_method, 'unknown') AS payment_method,
            SUM(s.quantity * s.selling_price)::BIGINT AS total
     FROM sales_ledger s
     LEFT JOIN sale_transactions st ON st.id = s.transaction_id
     WHERE s.event_time BETWEEN $1 AND $2
     GROUP BY COALESCE(st.payment_method, 'unknown')`,
    [startDate, endDate]
  );

  // 'unknown' covers sales from before sale_transactions existed (migrations/008) — real
  // historical revenue, not an error, so it's returned rather than silently dropped; the
  // frontend only needs to show that card when it's actually nonzero.
  const totals = { cash: 0, card: 0, bank_transfer: 0, unknown: 0 };
  response.rows.forEach((row) => {
    const key = row.payment_method in totals ? row.payment_method : "unknown";
    totals[key] += Number(row.total);
  });
  return totals;
};

module.exports = {
  checkoutSale,
  fetchSales,
  fetchSalesByProfitLoss,
  fetchSalesTimeSeries,
  fetchPaymentMediumTotals,
  getRecentSales,
  fetchBilledHistory,
  voidSale,
  refundSale,
};
