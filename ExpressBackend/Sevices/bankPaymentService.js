const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { checkoutSale } = require("./salesService");
const { getSettings } = require("./settingsService");
const { getOpenShift } = require("./shiftService");
const { buildQrPayload, generateQrDataUrl } = require("../utils/bankQr");

// Same idea as salesService.js's formatReceiptNo/formatRefundNo — a display reference
// derived from the row's own SERIAL id at read time, never stored, so Postgres's own
// atomic id allocation is the only uniqueness guarantee needed.
const REFERENCE_PREFIX = "BTX-";
const formatIntentRef = (id) => (id ? `${REFERENCE_PREFIX}${String(id).padStart(6, "0")}` : null);

// qr_data_url -> qrDataUrl: renamed on the way out so the API shape matches what
// createIntent's caller (CartPanel.jsx) already expects, and so every endpoint that
// returns an intent (create/get/list/confirm/cancel) exposes it under the same name —
// including the Pending Bank Payments page's list, which is what lets clicking a row
// re-open BankTransferQrModal with the exact original QR, no extra request needed.
const withReference = (row) => {
  if (!row) return row;
  const { qr_data_url, ...rest } = row;
  return { ...rest, referenceCode: formatIntentRef(row.id), qrDataUrl: qr_data_url };
};

const CHANNELS = ["bank_transfer", "jazzcash", "easypaisa"];

// Opens a pending payment: snapshots the cart + computes what's actually owed (mirrors
// checkoutSale's own cartTotal/creditToApply math exactly, since confirmIntent below hands
// this same cart straight to checkoutSale later). Deliberately does NOT touch products/
// lots/sales/sale_transactions/store credit at all — only confirmIntent does that, via the
// real checkoutSale, once payment is actually confirmed. No stock is reserved by opening an
// intent; an abandoned one costs nothing.
//
// channel='bank_transfer' (default) builds our own Raast QR, same as always. channel=
// 'jazzcash'/'easypaisa' skips that entirely — Controller/paymentGatewayController.js
// takes it from here, calling that gateway's own initiate API (jazzCashService.js etc.)
// using this row's gateway_txn_ref, and confirmIntent below is reused unchanged either way.
//
// requestingUser is always a real, logged-in user here (this route is requireAuth-gated,
// never called by a webhook) — its shopId is what the intent itself, and every sale later
// confirmed from it, belongs to.
const createIntent = async (
  items,
  requestingUser,
  { voucherCode, storeCreditRedeemed, channel = "bank_transfer" } = {}
) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "Cart is empty");
  }
  if (!CHANNELS.includes(channel)) {
    throw new ApiError(400, `Unknown payment channel "${channel}"`);
  }
  // Checked here too, not just in checkoutSale's own guard — a QR/JazzCash/Easypaisa intent
  // means the customer may pay within seconds of this call returning. Catching a missing
  // shift only at confirmIntent (after the money's already moved) would be far worse than
  // catching it now, before the customer scans anything.
  if (!(await getOpenShift(requestingUser.id))) {
    throw new ApiError(409, "Open a shift before making a sale — see the Shifts page");
  }

  let bankDetails = null;
  if (channel === "bank_transfer") {
    const settings = await getSettings(requestingUser.shopId);
    bankDetails = {
      bankName: settings.bank_name,
      accountTitle: settings.bank_account_title,
      accountNumber: settings.bank_account_number,
      iban: settings.bank_iban,
    };
    // IBAN specifically — not "account number OR IBAN" — because the real Raast QR payload
    // (utils/bankQr.js) only has a slot for the IBAN (tag 04); there's no field for a plain
    // account number in the verified format. bankName/accountTitle stay required too even
    // though they're not encoded in the QR itself — they're shown next to it on the checkout
    // screen (BankTransferQrModal.jsx) so there's a human-readable confirmation of the account.
    if (!bankDetails.bankName || !bankDetails.accountTitle || !bankDetails.iban) {
      throw new ApiError(
        400,
        "Bank IBAN isn't set up yet — add your bank name, account title, and IBAN on the Company page first"
      );
    }
  }

  const cartTotal = items.reduce((sum, i) => sum + i.sellingPrice * i.quantity, 0);
  const creditToApply =
    storeCreditRedeemed > 0 ? Math.min(Number(storeCreditRedeemed), cartTotal) : 0;
  const amount = cartTotal - creditToApply;
  if (!(amount > 0)) {
    throw new ApiError(400, "Nothing left to pay once store credit is applied");
  }

  const { rows } = await pool.query(
    `INSERT INTO bank_payment_intents (cart_snapshot, amount, voucher_code, store_credit_redeemed, created_by, channel, shop_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      JSON.stringify(items),
      amount,
      creditToApply > 0 ? voucherCode : null,
      creditToApply > 0 ? creditToApply : null,
      requestingUser.id,
      channel,
      requestingUser.shopId,
    ]
  );
  const intent = rows[0];

  if (channel !== "bank_transfer") {
    // No QR — just stamp our own reference on the row now so it's stable the moment the
    // gateway's initiate call needs it (that call happens next, in the controller, not here;
    // this service stays gateway-agnostic).
    const { rows: updatedRows } = await pool.query(
      `UPDATE bank_payment_intents SET gateway_txn_ref = $2 WHERE id = $1 RETURNING *`,
      [intent.id, formatIntentRef(intent.id)]
    );
    return withReference(updatedRows[0]);
  }

  // The real Raast payload (utils/bankQr.js) has no slot for a reference code — it's a
  // fixed IBAN+amount+expiry+CRC structure, verified against a real bank-generated QR —
  // so unlike the earlier plain-text draft, referenceCode is display-only now (shown next
  // to the QR, never embedded in it) and building the payload doesn't need the row's id at
  // all. Still done as a follow-up UPDATE rather than folded into the INSERT above, simply
  // because the QR image itself is only worth generating once the row (and its amount) is
  // durably committed.
  const payload = buildQrPayload(bankDetails, amount);
  const qrDataUrl = await generateQrDataUrl(payload);

  // Stored, not just returned — see migrations/013's comment: re-showing this exact QR
  // later (Pending Bank Payments page) must never risk regenerating a different one from
  // whatever the bank settings happen to be at that later moment.
  const { rows: updatedRows } = await pool.query(
    `UPDATE bank_payment_intents SET qr_data_url = $2 WHERE id = $1 RETURNING *`,
    [intent.id, qrDataUrl]
  );

  return withReference(updatedRows[0]);
};

const getIntent = async (id, shopId) => {
  const { rows } = await pool.query(
    `SELECT * FROM bank_payment_intents WHERE id = $1 AND shop_id = $2`,
    [id, shopId]
  );
  if (!rows[0]) throw new ApiError(404, "Bank payment intent not found");
  return withReference(rows[0]);
};

// How a gateway callback (JazzCash's pp_TxnRefNo, Easypaisa's order id) finds its way back
// to the intent that created it — indexed in migration 016 for exactly this lookup. No
// shopId here: this is called from the gateway's own callback route (no session, no
// req.shop), and gateway_txn_ref is a value this app itself generated (formatIntentRef,
// a global-serial-backed reference) — it can't collide across shops the way a human-chosen
// name could, so there's no "wrong shop" a lookup by this value alone could land on.
const getIntentByGatewayRef = async (gatewayTxnRef) => {
  const { rows } = await pool.query(
    `SELECT * FROM bank_payment_intents WHERE gateway_txn_ref = $1`,
    [gatewayTxnRef]
  );
  if (!rows[0]) throw new ApiError(404, "No bank payment intent found for that gateway reference");
  return withReference(rows[0]);
};

// Records the gateway's own last-known response code (e.g. JazzCash's pp_ResponseCode) —
// distinct from last_confirm_error, which is about checkoutSale itself failing *after* the
// gateway already reported success. A decline/timeout doesn't cancel the intent — the
// customer may just retry the same payment — so this only leaves a support/debugging trail,
// same "record it, let a human decide" shape as flagAmbiguous below. No shopId: same gateway-
// callback context as getIntentByGatewayRef above, acting on an id it already legitimately
// resolved from that lookup.
const recordGatewayResponse = async (id, code) => {
  const { rows } = await pool.query(
    `UPDATE bank_payment_intents SET gateway_response_code = $2 WHERE id = $1 RETURNING *`,
    [id, code]
  );
  if (!rows[0]) throw new ApiError(404, "Bank payment intent not found");
  return withReference(rows[0]);
};

// Owner/staff-facing list — Pending Bank Payments page and the header bell both use this,
// filtered to status='awaiting_payment' for the common case. channel is optional too (e.g.
// a future JazzCash-only view) — omitted, every channel is returned, same as before this
// param existed.
const listIntents = async ({ status, channel } = {}, shopId) => {
  const params = [shopId];
  const conditions = ["shop_id = $1"];
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (channel) {
    params.push(channel);
    conditions.push(`channel = $${params.length}`);
  }
  const query = `SELECT * FROM bank_payment_intents WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`;
  const { rows } = await pool.query(query, params);
  return rows.map(withReference);
};

// Turns a pending intent into a real sale — the ONLY place that happens for a bank-
// transfer payment. Reuses checkoutSale() completely unmodified (same function cash/card
// sales already go through), so there remains exactly one place in the whole app that ever
// creates a real sale/decrements stock. `autoConfirmed`/`matchedSourceText` let the
// notification-forwarder auto-matcher (Sevices/PaymentNotifications/matchingService.js)
// call this exact same function a human's "Mark as Paid" click does — there is only ever
// one confirm code path, manual or automatic.
//
// Deliberately fetched by id ALONE, not id+shop_id — the automated path (requestingUser:
// null) doesn't know which shop a given intent id belongs to ahead of time; that's exactly
// what this lookup is for. Once the row is in hand, intent.shop_id (not requestingUser's)
// is what gets passed to checkoutSale — the intent itself is always the source of truth for
// which shop a sale belongs to. A manual confirm (requestingUser set) additionally checks
// that the intent actually belongs to that user's own shop, so an Owner can't confirm (or
// even discover the existence of) another shop's pending payment by guessing its id.
const confirmIntent = async (id, { requestingUser, autoConfirmed = false, matchedSourceText = null } = {}) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Locking this row is what makes two concurrent confirm attempts on the SAME intent
    // (a double-click, or a human and a future auto-matcher at the same instant) serialize
    // correctly — identical reasoning to voidSale/refundSale's own FOR UPDATE locks
    // (salesService.js). The second attempt blocks here until the first's transaction
    // commits, then re-reads the now-'confirmed' row and is correctly rejected below.
    const { rows } = await client.query(
      `SELECT * FROM bank_payment_intents WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const intent = rows[0];
    if (!intent) throw new ApiError(404, "Bank payment intent not found");
    if (requestingUser && String(intent.shop_id) !== String(requestingUser.shopId)) {
      // Same 404 as "doesn't exist" — an Owner probing another shop's intent ids learns
      // nothing beyond what a nonexistent id would also tell them.
      throw new ApiError(404, "Bank payment intent not found");
    }
    if (intent.status === "confirmed") throw new ApiError(409, "This payment was already confirmed");
    if (intent.status === "cancelled") throw new ApiError(409, "This payment was already cancelled — it can't be confirmed");

    let result;
    try {
      // checkoutSale opens its OWN connection/transaction (pool.connect(), not this
      // function's `client`) — a stock or voucher-balance conflict there rolls back only
      // that inner transaction. This outer transaction (and the row lock above) is
      // untouched either way, so the error-recording branch below always runs cleanly.
      result = await checkoutSale(intent.cart_snapshot, "bank_transfer", requestingUser, intent.shop_id, {
        voucherCode: intent.voucher_code || undefined,
        storeCreditRedeemed: intent.store_credit_redeemed || undefined,
      });
    } catch (err) {
      // Accepted trade-off (see plan.md): since stock is never reserved when the QR is
      // generated, two intents can both target the last unit of a product. Whoever
      // confirms first wins; this makes the loser's failure visible on the Pending Bank
      // Payments page (last_confirm_error) instead of silently vanishing — status stays
      // 'awaiting_payment' so nothing is lost, ready for manual resolution.
      await client.query(`UPDATE bank_payment_intents SET last_confirm_error = $2 WHERE id = $1`, [
        id,
        err.message || String(err),
      ]);
      await client.query("COMMIT");
      throw err;
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE bank_payment_intents
       SET status = 'confirmed', transaction_id = $2, resolved_by = $3, resolved_at = NOW(),
           auto_confirmed = $4, matched_source_text = $5, last_confirm_error = NULL
       WHERE id = $1 RETURNING *`,
      [id, result.transactionId, requestingUser?.id || null, autoConfirmed, matchedSourceText]
    );
    await client.query("COMMIT");
    return { ...withReference(updatedRows[0]), receiptNo: result.receiptNo };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err instanceof ApiError ? err : new ApiError(500, err.message);
  } finally {
    client.release();
  }
};

const cancelIntent = async (id, requestingUser, reason) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT * FROM bank_payment_intents WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
      [id, requestingUser.shopId]
    );
    const intent = rows[0];
    if (!intent) throw new ApiError(404, "Bank payment intent not found");
    if (intent.status === "confirmed") {
      throw new ApiError(409, "This payment was already confirmed — it can't be cancelled, only refunded");
    }
    if (intent.status === "cancelled") throw new ApiError(409, "This payment was already cancelled");

    const { rows: updatedRows } = await client.query(
      `UPDATE bank_payment_intents
       SET status = 'cancelled', resolved_by = $2, resolved_at = NOW(), resolution_note = $3
       WHERE id = $1 RETURNING *`,
      [id, requestingUser?.id || null, reason || null]
    );
    await client.query("COMMIT");
    return withReference(updatedRows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err instanceof ApiError ? err : new ApiError(500, err.message);
  } finally {
    client.release();
  }
};

// Called by the notification-forwarder matcher (Sevices/PaymentNotifications/
// matchingService.js) when one incoming notification's amount matches more than one
// pending intent, or one intent matches more than one incoming notification — "never
// guess" (plan.md): every intent involved gets flagged for a human to sort out rather
// than any of them being auto-confirmed. `id -> candidates` lets each intent record only
// the specific conflicting notification(s)/intent(s) relevant to it. No shopId — same
// reasoning as confirmIntent's automated path: matchingService.js finds these candidate
// ids itself (see its own file for the current single-forwarder limitation), and each
// UPDATE here acts only on an id it already found, not a name/list a shop boundary needs
// to gate.
const flagAmbiguous = async (candidatesByIntentId) => {
  const ids = Object.keys(candidatesByIntentId);
  if (ids.length === 0) return [];
  const results = [];
  for (const id of ids) {
    const { rows } = await pool.query(
      `UPDATE bank_payment_intents
       SET status = 'ambiguous', match_candidates = $2
       WHERE id = $1 AND status IN ('awaiting_payment', 'ambiguous')
       RETURNING *`,
      [id, JSON.stringify(candidatesByIntentId[id])]
    );
    if (rows[0]) results.push(withReference(rows[0]));
  }
  return results;
};

// Manual "actually, go back to waiting" — an Owner/staff decision after looking at an
// ambiguous pair, distinct from confirmIntent/cancelIntent since neither "yes this one
// was paid" nor "no, cancel it" fits "I'm not sure yet, keep waiting."
const requeueIntent = async (id, requestingUser) => {
  const { rows } = await pool.query(
    `UPDATE bank_payment_intents
     SET status = 'awaiting_payment', match_candidates = NULL, resolution_note = $2
     WHERE id = $1 AND shop_id = $3 AND status = 'ambiguous'
     RETURNING *`,
    [id, requestingUser?.id ? `Requeued by user ${requestingUser.id}` : null, requestingUser.shopId]
  );
  if (!rows[0]) throw new ApiError(404, "No ambiguous bank payment intent found with that id");
  return withReference(rows[0]);
};

module.exports = {
  CHANNELS,
  createIntent,
  getIntent,
  getIntentByGatewayRef,
  recordGatewayResponse,
  listIntents,
  confirmIntent,
  cancelIntent,
  flagAmbiguous,
  requeueIntent,
  formatIntentRef,
};
