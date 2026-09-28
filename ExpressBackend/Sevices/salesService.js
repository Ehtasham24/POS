const { pool } = require("../Db");
const { getSettings, getBusinessTimezone, shopRangeToUtc } = require("./settingsService");
const storeCreditService = require("./storeCreditService");
const { applyStockDelta, lockProductsInOrder } = require("./lotService");
const { getOpenShift, touchActivity } = require("./shiftService");
const { hasFeature } = require("../config/features");
const ApiError = require("../utils/ApiError");
const { assertOwnedByShop } = require("../utils/shopOwnership");

const getRecentSales = async (shopId) => {
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
      WHERE s.is_voided = false AND s.shop_id = $1
      ORDER BY s.sale_time DESC
      LIMIT 1;  -- Get only the most recent sale
    `;

    // Execute the query to get the most recent sale
    const recentSaleResult = await pool.query(recentSaleQuery, [shopId]);

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
        AND s.shop_id = $2
      ORDER BY s.sale_time DESC;
    `;

    // Execute the query to get all sales at the same second
    const sameTimeSalesResult = await pool.query(sameTimeSalesQuery, [
      recentSaleTime,
      shopId,
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

const getLowStockThreshold = async (shopId) => {
  const settings = await getSettings(shopId);
  const threshold = Number(settings.low_stock_threshold);
  return Number.isFinite(threshold) ? threshold : 10;
};

// null = unlimited (the default — no setting means no age restriction on refunds, Owner/
// staff discretion). Mirrors getLowStockThreshold's read-from-settings shape.
const getRefundWindowDays = async (shopId) => {
  const settings = await getSettings(shopId);
  const days = Number(settings.refund_window_days);
  return Number.isFinite(days) && days > 0 ? days : null;
};

// Receipt numbers are just the sale_transactions row's SERIAL id, formatted — Postgres
// allocates that atomically under concurrency by design (same guarantee sales.id/users.id
// already rely on elsewhere in this file), so there's no custom counter/locking logic that
// could produce a duplicate. Formatting is applied at read/display time only, never stored,
// so the prefix/padding can change later without having to reformat historical receipts.
//
// NOTE: sale_transactions.id is a single database-wide SERIAL, so receipt numbers are
// unique but not contiguous per shop once there's more than one shop (Shop A might see
// RCPT-000001, RCPT-000004, ...) — a cosmetic gap, not a correctness issue; tracked as a
// follow-up (a per-shop sequence) rather than fixed in this pass.
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
//
// shopId is its own explicit argument, never derived from requestingUser — this is called
// both from a live checkout (requestingUser set, shopId = req.user.shopId) and from an
// automated bank-payment confirmation (requestingUser: null, shopId = the pending intent's
// OWN shop_id — see bankPaymentService.js's confirmIntent). A sale always belongs to exactly
// one shop; unlike a shift, that's never optional just because nobody's logged in for this
// particular call.
const checkoutSale = async (items, paymentMethod, requestingUser, shopId, { voucherCode, storeCreditRedeemed } = {}) => {
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
    // (Sevices/PaymentNotifications/matchingService.js) and the JazzCash/Easypaisa webhook
    // callbacks (Controller/paymentGatewayController.js) confirm a pending intent with no
    // logged-in staff behind it at all, possibly minutes or hours after the customer paid —
    // there's no one present who could have "opened a shift" for that. A shift is only
    // required when a real person is at the keyboard right now: a live checkout (always has
    // req.user, requireAuth-gated) or a staff member manually clicking "Mark as Paid" on a
    // pending payment (also passes a real requestingUser) — either way, requestingUser being
    // set is exactly the signal that this is a live, human-initiated sale, not an automated
    // confirmation with nobody around to have clocked in.
    // The shifts feature (and its "you must have one open" rule) is Advanced-tier only —
    // a Basic/Smart shop simply has no Shifts page to open one on, so this guard has to be
    // conditional on the requesting shop's tier, not just on requestingUser being present.
    // requestingUser.shopTier (not a fresh lookup) is what's actually current here: this
    // whole branch only runs when requestingUser is set (a live checkout, never the
    // automated/webhook path), and requestingUser is always freshly re-fetched per-request
    // by requireAuth, so its shopTier can't be stale the way a cached value could be.
    const openShift = await getOpenShift(requestingUser?.id);
    if (requestingUser && hasFeature(requestingUser.shopTier, "shifts") && !openShift) {
      throw new ApiError(409, "Open a shift before making a sale — see the Shifts page");
    }

    // shift_id is stamped the same way — whichever shift (migrations/017) is currently open
    // for this user, or null if none is (requestingUser is null, the automated-confirmation
    // case above). This is the ONLY place a sale gets attributed to a shift; closeShift later
    // sums cash sales by this column, not by a time window, so two staff with simultaneously-
    // open shifts never get cross-attributed.
    const { rows: txnRows } = await client.query(
      `INSERT INTO sale_transactions (sold_by, payment_method, store_credit_applied, shift_id, shop_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [requestingUser?.id || null, paymentMethod || null, creditToApply, openShift?.id || null, shopId]
    );
    const transactionId = txnRows[0].id;
    // A real sale is exactly the "this shift is genuinely in use" signal the auto-close
    // sweep (Sevices/shiftSweep.js) needs — resets the idle clock every time one happens.
    await touchActivity(client, openShift?.id);

    if (creditToApply > 0) {
      await storeCreditService.redeemVoucher(client, {
        code: voucherCode,
        amount: creditToApply,
        transactionId,
        requestingUser,
        shopId,
      });
    }

    const threshold = await getLowStockThreshold(shopId);

    await lockProductsInOrder(client, items.map((i) => i.productID), shopId);

    const soldItems = [];
    for (const item of items) {
      const { sellingPrice, quantity, productID, lotId } = item;
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new ApiError(400, `Invalid quantity for product ${productID}`);
      }

      // Shared with stockAdjustmentService.js via lotService.js's applyStockDelta — same
      // FOR UPDATE-locked, throws-on-insufficient-stock primitive either way, just a
      // negative delta here (a sale spends stock down) vs. either sign for an adjustment.
      let buyingPrice;
      try {
        ({ buyingPrice } = await applyStockDelta(client, { productId: productID, lotId, delta: -qty, shopId }));
      } catch (err) {
        // Re-worded only where checkoutSale had a more specific existing message than
        // applyStockDelta's generic ones, so anything already surfaced to a cashier reads
        // the same as it did before this extraction.
        if (err instanceof ApiError && err.status === 404) {
          throw new ApiError(404, lotId ? `Lot not found for product ${productID}` : `Product ${productID} not found`);
        }
        throw err;
      }

      const { rows: saleRows } = await client.query(
        `INSERT INTO sales (selling_price, quantity, product_id, sale_time, lot_id, buying_price, sold_by, transaction_id, shop_id)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)
         RETURNING id`,
        [sellingPrice, qty, productID, lotId || null, buyingPrice, requestingUser?.id || null, transactionId, shopId]
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
  paymentMethod = null, // 'cash' | 'card' | 'bank_transfer' — filters by the whole
  // transaction's payment medium (sale_transactions.payment_method), not a per-item field.
  shopId
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

    // shop_id is unconditional, not behind an "if filter set" check like the rest —
    // every caller of this function has a shop, there's no "show me everything"
    // super-admin view of it.
    const conditions = ["s.shop_id = $1"];
    const params = [shopId];
    if (hasDateFilter) {
      params.push(...(await shopRangeToUtc(startDate, endDate, shopId)));
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
      const businessTimezone = await getBusinessTimezone(shopId);
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
    const whereClause = `WHERE ${conditions.join(" AND ")}`;
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

    // batch_key alone (e.g. the legacy "same second" fallback) isn't shop-unique, so this
    // final fetch still needs its own shop_id filter — otherwise a legacy batch_key that
    // happens to collide with another shop's legacy rows (same truncated second, extremely
    // unlikely but not impossible) could pull in a line item that doesn't belong to this
    // transaction at all.
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
       WHERE ${BATCH_KEY_EXPR} = ANY($1::text[]) AND s.shop_id = $2
       ORDER BY s.sale_time DESC, s.id ASC;`,
      [batchKeys, shopId]
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

    // shop_id baked straight into the lookup (not checked afterward) — a sale id from
    // another shop simply doesn't match, giving the same 404 an actually-nonexistent id
    // would, rather than ever locking/touching a row this user's shop doesn't own.
    const { rows } = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
      [saleId, requestingUser.shopId]
    );
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
      const businessTimezone = await getBusinessTimezone(requestingUser.shopId);
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
  // The Store Credit page shows the contact's name next to the voucher — it has to be this
  // shop's contact, not just any id that exists.
  await assertOwnedByShop(pool, requestingUser.shopId, { contacts: contactId });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Locking the sale row is what makes two concurrent refund attempts on the SAME sale
    // serialize correctly — the second transaction's FOR UPDATE blocks until the first
    // commits, and under Postgres's read-committed default, this transaction's next read of
    // `refunds` (below) sees that committed row. A FOR UPDATE directly on a SUM(...) query
    // isn't valid SQL — Postgres can't lock rows an aggregate doesn't return 1:1 with — so
    // the lock has to live here, exactly like voidSale does for the same reason. shop_id is
    // baked into the fetch itself, same reasoning as voidSale's own lookup above.
    const { rows } = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
      [saleId, requestingUser.shopId]
    );
    const sale = rows[0];
    if (!sale) throw new ApiError(404, "Sale not found");
    if (sale.is_voided) throw new ApiError(409, "This sale was voided — nothing to refund");

    const windowDays = await getRefundWindowDays(requestingUser.shopId);
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

    // shift_id reflects whichever shift is open for whoever's processing THIS refund right
    // now — deliberately not the original sale's shift. A refund's cash impact hits the
    // drawer at refund time, possibly days later and by different staff than rang up the
    // original sale, so it belongs in whichever shift is open when the cash actually leaves.
    const openShift = await getOpenShift(requestingUser?.id);

    // When refundMethod is store_credit, this row IS the voucher — its own refund_amount is
    // the initial value, its own id (formatted below as REF-XXXXXX) is the redemption code.
    // No separate "issue" step needed (see storeCreditService.js / migrations/011).
    const { rows: inserted } = await client.query(
      `INSERT INTO refunds (sale_id, transaction_id, quantity, refund_amount, refund_method, condition, reason, refunded_by, contact_id, shift_id, shop_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [saleId, sale.transaction_id, qty, amount, refundMethod, condition, reason, requestingUser.id, contactId || null, openShift?.id || null, requestingUser.shopId]
    );
    await touchActivity(client, openShift?.id);

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

// ---------------------------------------------------------------------------------------
// Sales Report
//
// Every figure below reads sales_ledger (migrations/009_refunds.sql): voided sales are
// already excluded, and each refund is a negative-quantity row dated on its OWN
// event_time, so a refund reduces the day it happens rather than rewriting the original
// sale's day. Costs are sales.buying_price, the cost snapshotted at the moment of each
// sale, so past profit never moves when a product's price changes later. The payment-
// medium filter LEFT JOINs sale_transactions; legacy sales with no transaction simply never
// match a specific medium.
// ---------------------------------------------------------------------------------------

const assertReportRange = (startDate, endDate) => {
  if (!startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
    throw new ApiError(400, "Invalid date inputs. Please provide valid start and end dates.");
  }
};

const paymentFilter = (paymentMethod) => (PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : null);

// The window of the same length immediately before [start, end] — "vs previous period".
// Ranges are minute-precise with an inclusive end (00:00-23:59), so the length is end-start
// plus that last minute: today compares with yesterday 00:00-23:59, August with July.
// Done on the naive date-time strings themselves (parsed and re-printed as if UTC) so the
// previous window is interpreted by the database exactly the way the current one is.
const previousWindow = (startDate, endDate) => {
  const asUtc = (value) => new Date(`${String(value).replace(" ", "T").replace(/Z$/, "")}Z`).getTime();
  const start = asUtc(startDate);
  const end = asUtc(endDate);
  const length = end - start + 60 * 1000;
  const print = (ms) => new Date(ms).toISOString().slice(0, 19);
  return { startDate: print(start - length), endDate: print(end - length) };
};

const reportKpis = async (startDate, endDate, paymentMethod, shopId) => {
  const method = paymentFilter(paymentMethod);
  const [{ rows: ledger }, { rows: voids }] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(s.quantity * s.selling_price) FILTER (WHERE s.quantity > 0), 0)::BIGINT AS gross_sales,
         COALESCE(-SUM(s.quantity * s.selling_price) FILTER (WHERE s.quantity < 0), 0)::BIGINT AS refunds,
         COALESCE(SUM(s.quantity * s.buying_price), 0)::BIGINT AS cost,
         COALESCE(SUM(s.quantity * (s.selling_price - s.buying_price)), 0)::BIGINT AS profit,
         COALESCE(SUM(s.quantity) FILTER (WHERE s.quantity > 0), 0)::BIGINT AS items_sold,
         COALESCE(-SUM(s.quantity) FILTER (WHERE s.quantity < 0), 0)::BIGINT AS items_refunded,
         COUNT(*) FILTER (WHERE s.quantity < 0)::INT AS refund_count,
         -- One receipt per checkout; a legacy sale with no receipt counts on its own.
         COUNT(DISTINCT COALESCE('t' || s.transaction_id, 's' || s.sale_id)) FILTER (WHERE s.quantity > 0)::INT AS transactions
       FROM sales_ledger s
       LEFT JOIN sale_transactions st ON st.id = s.transaction_id
       WHERE s.event_time BETWEEN $1 AND $2
         AND s.shop_id = $3
         AND ($4::text IS NULL OR st.payment_method = $4)`,
      [startDate, endDate, shopId, method]
    ),
    // Voids never reach sales_ledger at all — counted from sales directly, on the day the
    // void happened.
    pool.query(
      `SELECT COUNT(*)::INT AS void_count,
              COALESCE(SUM(s.quantity * s.selling_price), 0)::BIGINT AS void_value
       FROM sales s
       LEFT JOIN sale_transactions st ON st.id = s.transaction_id
       WHERE s.is_voided AND s.voided_at BETWEEN $1 AND $2
         AND s.shop_id = $3
         AND ($4::text IS NULL OR st.payment_method = $4)`,
      [startDate, endDate, shopId, method]
    ),
  ]);
  const row = ledger[0];
  const num = (value) => Number(value) || 0;
  const grossSales = num(row.gross_sales);
  const refunds = num(row.refunds);
  const netSales = grossSales - refunds;
  const profit = num(row.profit);
  const transactions = num(row.transactions);
  return {
    grossSales,
    refunds,
    netSales,
    cost: num(row.cost),
    profit,
    marginPercent: netSales ? Math.round((profit / netSales) * 1000) / 10 : null,
    transactions,
    averageSale: transactions ? Math.round(grossSales / transactions) : 0,
    itemsSold: num(row.items_sold),
    itemsRefunded: num(row.items_refunded),
    refundCount: num(row.refund_count),
    voidCount: num(voids[0].void_count),
    voidValue: num(voids[0].void_value),
  };
};

// Headline figures for the range, plus the same figures for the equal-length window just
// before it, so every tile can show its change.
const fetchReportSummary = async (startDate, endDate, paymentMethod, shopId) => {
  assertReportRange(startDate, endDate);
  [startDate, endDate] = await shopRangeToUtc(startDate, endDate, shopId);
  const previous = previousWindow(startDate, endDate);
  const [current, before] = await Promise.all([
    reportKpis(startDate, endDate, paymentMethod, shopId),
    reportKpis(previous.startDate, previous.endDate, paymentMethod, shopId),
  ]);
  return { current, previous: before, previousRange: previous };
};

// Sort keys the product table may ask for -> the SQL they mean. A fixed map, never the
// client's string, since it's interpolated into ORDER BY.
const PRODUCT_SORTS = {
  revenue: "revenue",
  profit: "profit",
  qty: "qty_sold",
  refunded: "qty_refunded",
  margin: "profit::numeric / NULLIF(revenue, 0)",
  price: "avg_price",
  name: "productname",
};
const MAX_PRODUCT_PAGE_SIZE = 500;

// Per-product performance, paginated and sorted in the database. `type` keeps the report's
// existing profit/loss filter; categoryId and search narrow it further. Totals cover every
// matching product, not just the page on screen.
const fetchReportProducts = async (
  { startDate, endDate, paymentMethod, type, categoryId, search, sort = "revenue", direction = "desc", page = 1, pageSize = 25 },
  shopId
) => {
  assertReportRange(startDate, endDate);
  [startDate, endDate] = await shopRangeToUtc(startDate, endDate, shopId);
  const orderExpr = PRODUCT_SORTS[sort] || PRODUCT_SORTS.revenue;
  const orderDir = direction === "asc" ? "ASC" : "DESC";
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), MAX_PRODUCT_PAGE_SIZE);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const having =
    type === "profit"
      ? "HAVING SUM(s.quantity * (s.selling_price - s.buying_price)) > 0"
      : type === "loss"
      ? "HAVING SUM(s.quantity * (s.selling_price - s.buying_price)) < 0"
      : "";

  const { rows } = await pool.query(
    `WITH per_product AS (
       SELECT p.id AS product_id,
              p.productname,
              p.category_id,
              c.category_name,
              COALESCE(SUM(s.quantity) FILTER (WHERE s.quantity > 0), 0)::BIGINT AS qty_sold,
              COALESCE(-SUM(s.quantity) FILTER (WHERE s.quantity < 0), 0)::BIGINT AS qty_refunded,
              SUM(s.quantity * s.selling_price)::BIGINT AS revenue,
              SUM(s.quantity * s.buying_price)::BIGINT AS cost,
              SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT AS profit,
              -- Quantity-weighted, so a few heavily discounted units can't drag the
              -- average below where most of the volume actually sold.
              CAST(SUM(s.quantity * s.selling_price) / NULLIF(SUM(s.quantity), 0) AS INT) AS avg_price
       FROM sales_ledger s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN sale_transactions st ON st.id = s.transaction_id
       WHERE s.event_time BETWEEN $1 AND $2
         AND s.shop_id = $3
         AND ($4::text IS NULL OR st.payment_method = $4)
         AND ($5::int IS NULL OR p.category_id = $5)
         AND ($6::text IS NULL OR p.productname ILIKE '%' || $6 || '%')
       GROUP BY p.id, p.productname, p.category_id, c.category_name
       ${having}
     ),
     totals AS (
       SELECT COUNT(*)::INT AS total_count,
              COALESCE(SUM(revenue), 0)::BIGINT AS total_revenue,
              COALESCE(SUM(cost), 0)::BIGINT AS total_cost,
              COALESCE(SUM(profit), 0)::BIGINT AS total_profit,
              COALESCE(SUM(qty_sold), 0)::BIGINT AS total_qty
       FROM per_product
     )
     SELECT totals.*, page.*
     FROM totals
     LEFT JOIN LATERAL (
       SELECT * FROM per_product
       ORDER BY ${orderExpr} ${orderDir} NULLS LAST, productname, product_id
       LIMIT $7 OFFSET $8
     ) page ON true`,
    [
      startDate,
      endDate,
      shopId,
      paymentFilter(paymentMethod),
      categoryId ? Number(categoryId) : null,
      search && String(search).trim() ? String(search).trim() : null,
      size,
      (safePage - 1) * size,
    ]
  );

  const head = rows[0];
  const totalCount = head.total_count;
  const toNumber = (value) => (value === null || value === undefined ? null : Number(value));
  return {
    rows: rows
      .filter((row) => row.product_id !== null)
      .map((row) => ({
        productId: row.product_id,
        productname: row.productname,
        categoryId: row.category_id,
        categoryName: row.category_name,
        qtySold: toNumber(row.qty_sold),
        qtyRefunded: toNumber(row.qty_refunded),
        revenue: toNumber(row.revenue),
        cost: toNumber(row.cost),
        profit: toNumber(row.profit),
        avgPrice: toNumber(row.avg_price),
      })),
    totals: {
      revenue: Number(head.total_revenue),
      cost: Number(head.total_cost),
      profit: Number(head.total_profit),
      qtySold: Number(head.total_qty),
    },
    page: safePage,
    pageSize: size,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / size)),
  };
};

// The report's "where did it come from" views: by category, by cashier, and when in the
// day/week sales happen. Hours and weekdays are bucketed in the shop's business timezone
// (same as the trend chart), so "7 PM" means 7 PM on the shop's own clock.
const fetchReportBreakdowns = async (startDate, endDate, paymentMethod, shopId) => {
  assertReportRange(startDate, endDate);
  [startDate, endDate] = await shopRangeToUtc(startDate, endDate, shopId);
  const method = paymentFilter(paymentMethod);
  const businessTimezone = await getBusinessTimezone(shopId);
  const base = `FROM sales_ledger s
       LEFT JOIN sale_transactions st ON st.id = s.transaction_id
       WHERE s.event_time BETWEEN $1 AND $2
         AND s.shop_id = $3
         AND ($4::text IS NULL OR st.payment_method = $4)`;
  const params = [startDate, endDate, shopId, method];
  const localTime = `((s.event_time AT TIME ZONE 'UTC') AT TIME ZONE $5)`;

  const [byCategory, byCashier, byHour, byWeekday] = await Promise.all([
    pool.query(
      `SELECT c.id AS category_id,
              COALESCE(c.category_name, 'Uncategorized') AS category_name,
              COALESCE(SUM(s.quantity) FILTER (WHERE s.quantity > 0), 0)::BIGINT AS qty_sold,
              SUM(s.quantity * s.selling_price)::BIGINT AS revenue,
              SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT AS profit
       FROM sales_ledger s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN sale_transactions st ON st.id = s.transaction_id
       WHERE s.event_time BETWEEN $1 AND $2
         AND s.shop_id = $3
         AND ($4::text IS NULL OR st.payment_method = $4)
       GROUP BY c.id, c.category_name
       ORDER BY revenue DESC NULLS LAST, category_name`,
      params
    ),
    // Who rang the sales up — the original sale's cashier, so refunds count against the
    // sale they reverse. Sales from before users existed show as "Unassigned".
    pool.query(
      `SELECT u.id AS user_id,
              COALESCE(u.display_name, 'Unassigned') AS name,
              COUNT(DISTINCT COALESCE('t' || s.transaction_id, 's' || s.sale_id)) FILTER (WHERE s.quantity > 0)::INT AS transactions,
              SUM(s.quantity * s.selling_price)::BIGINT AS revenue,
              SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT AS profit
       FROM sales_ledger s
       JOIN sales orig ON orig.id = s.sale_id
       LEFT JOIN users u ON u.id = orig.sold_by
       LEFT JOIN sale_transactions st ON st.id = s.transaction_id
       WHERE s.event_time BETWEEN $1 AND $2
         AND s.shop_id = $3
         AND ($4::text IS NULL OR st.payment_method = $4)
       GROUP BY u.id, u.display_name
       ORDER BY revenue DESC NULLS LAST, name`,
      params
    ),
    pool.query(
      `SELECT EXTRACT(HOUR FROM ${localTime})::INT AS hour,
              COUNT(DISTINCT COALESCE('t' || s.transaction_id, 's' || s.sale_id))::INT AS transactions,
              SUM(s.quantity * s.selling_price)::BIGINT AS revenue
       ${base} AND s.quantity > 0
       GROUP BY hour ORDER BY hour`,
      [...params, businessTimezone]
    ),
    pool.query(
      `SELECT EXTRACT(ISODOW FROM ${localTime})::INT AS weekday,
              COUNT(DISTINCT COALESCE('t' || s.transaction_id, 's' || s.sale_id))::INT AS transactions,
              SUM(s.quantity * s.selling_price)::BIGINT AS revenue
       ${base} AND s.quantity > 0
       GROUP BY weekday ORDER BY weekday`,
      [...params, businessTimezone]
    ),
  ]);

  const numbers = (row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : value]));
  // Every hour/weekday present even with no sales, so the charts have an honest zero
  // instead of a gap.
  const hours = new Map(byHour.rows.map((r) => [r.hour, numbers(r)]));
  const days = new Map(byWeekday.rows.map((r) => [r.weekday, numbers(r)]));
  return {
    byCategory: byCategory.rows.map(numbers),
    byCashier: byCashier.rows.map(numbers),
    byHour: Array.from({ length: 24 }, (_, hour) => hours.get(hour) || { hour, transactions: 0, revenue: 0 }),
    byWeekday: Array.from({ length: 7 }, (_, i) => days.get(i + 1) || { weekday: i + 1, transactions: 0, revenue: 0 }),
  };
};

// Daily revenue/profit/units within a date range — powers the Sales Report trend chart.
const fetchSalesTimeSeries = async (startDate, endDate, paymentMethod = null, shopId) => {
  assertReportRange(startDate, endDate);
  [startDate, endDate] = await shopRangeToUtc(startDate, endDate, shopId);

  // Sources from sales_ledger, same reasoning as the Sales Report queries above — a refund lands on its
  // OWN day here (negative units/revenue/profit that day), not retroactively on the day of
  // the original sale. Grouped by day in the business timezone (not Postgres's UTC session
  // timezone) so the chart's day buckets agree with what a human looking at the shop's clock
  // would call "today" — same AT TIME ZONE reasoning as fetchBilledHistory's cashier filter.
  //
  // Every bucket in the range comes back, a quiet day as a zero — a chart that skips the days
  // with no sales draws a line straight across them and hides the gap. Longer ranges use
  // coarser buckets so the chart stays readable: a bar per day up to two months, per week
  // up to half a year, per month beyond that. `day` is the bucket's first day on the shop's
  // own calendar, as plain "YYYY-MM-DD" text so no timezone can shift it on the way.
  const spanDays = (new Date(endDate) - new Date(startDate)) / 86400000;
  const unit = spanDays <= 62 ? "day" : spanDays <= 186 ? "week" : "month";
  const businessTimezone = await getBusinessTimezone(shopId);
  const localDay = (time) => `date_trunc($6, (${time} AT TIME ZONE 'UTC') AT TIME ZONE $3)`;
  const response = await pool.query(
    `WITH totals AS (
       SELECT ${localDay("s.event_time")} AS bucket,
              SUM(s.quantity * s.selling_price)::BIGINT AS revenue,
              SUM(s.quantity * (s.selling_price - s.buying_price))::BIGINT AS profit
       FROM sales_ledger s
       LEFT JOIN sale_transactions st ON st.id = s.transaction_id
       WHERE s.event_time BETWEEN $1 AND $2
         AND s.shop_id = $5
         AND ($4::text IS NULL OR st.payment_method = $4)
       GROUP BY bucket
     )
     SELECT to_char(b.bucket, 'YYYY-MM-DD') AS day,
            COALESCE(t.revenue, 0)::BIGINT AS revenue,
            COALESCE(t.profit, 0)::BIGINT AS profit
     FROM generate_series(${localDay("$1::timestamp")}, ${localDay("$2::timestamp")}, ('1 ' || $6)::interval) AS b(bucket)
     LEFT JOIN totals t ON t.bucket = b.bucket
     ORDER BY b.bucket`,
    [startDate, endDate, businessTimezone, PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : null, shopId, unit]
  );

  return {
    unit,
    rows: response.rows.map((r) => ({ day: r.day, revenue: Number(r.revenue), profit: Number(r.profit) })),
  };
};

// Cash/card/bank-transfer totals for a date range — powers both the Sales Report's summary
// cards and the Payment Mediums page's, one function reused rather than duplicated. Revenue
// (quantity * selling_price), not profit — a payment-medium breakdown is about how money
// came in, which the report's per-product profit view doesn't answer.
const fetchPaymentMediumTotals = async (startDate, endDate, shopId) => {
  assertReportRange(startDate, endDate);
  [startDate, endDate] = await shopRangeToUtc(startDate, endDate, shopId);
  const response = await pool.query(
    `SELECT COALESCE(st.payment_method, 'unknown') AS payment_method,
            SUM(s.quantity * s.selling_price)::BIGINT AS total
     FROM sales_ledger s
     LEFT JOIN sale_transactions st ON st.id = s.transaction_id
     WHERE s.event_time BETWEEN $1 AND $2 AND s.shop_id = $3
     GROUP BY COALESCE(st.payment_method, 'unknown')`,
    [startDate, endDate, shopId]
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
  fetchReportSummary,
  fetchReportProducts,
  fetchReportBreakdowns,
  fetchSalesTimeSeries,
  fetchPaymentMediumTotals,
  getRecentSales,
  fetchBilledHistory,
  voidSale,
  refundSale,
};
