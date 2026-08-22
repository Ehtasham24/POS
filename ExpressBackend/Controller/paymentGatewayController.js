const {
  createIntent,
  getIntentByGatewayRef,
  recordGatewayResponse,
  confirmIntent,
} = require("../Sevices/bankPaymentService");
const jazzCashService = require("../Sevices/ThirdParty/JazzCash/jazzCashService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

// JazzCash Payment Portal (pp_TxnType=MWALLET) — see plan.md's "JazzCash + Easypaisa
// merchant integration" section. Opens a pending intent exactly like a bank-transfer QR
// does (channel='jazzcash' instead), then hands back the signed pp_* fields the frontend
// POSTs straight to JazzCash's own hosted page (gatewayUrl) — the customer enters their
// wallet PIN/OTP there, never on our page, and JazzCash calls JazzCashCallback below with
// the result.
const InitiateJazzCashPayment = asyncHandler(async (req, res) => {
  const { items, voucherCode, storeCreditRedeemed } = req.body;
  const intent = await createIntent(items, req.user, {
    voucherCode,
    storeCreditRedeemed,
    channel: "jazzcash",
  });
  const { baseUrl } = jazzCashService.getConfig();
  const fields = jazzCashService.buildMobileWalletRequest(intent);
  res.status(201).send({ intent, gatewayUrl: baseUrl, fields });
});

// JazzCash's own server POSTs the transaction result here (pp_ReturnURL) once the customer
// finishes on their hosted page — public, no session/shared-secret, verified instead via
// pp_SecureHash (jazzCashService.verifyCallback), the same "reject anything that doesn't
// cryptographically check out" shape requireForwarderSecret enforces with a plain shared
// string, just with a real HMAC here since this is a genuine third party, not a phone the
// owner physically controls.
const JazzCashCallback = asyncHandler(async (req, res) => {
  const fields = req.body || {};
  if (!jazzCashService.verifyCallback(fields)) {
    throw new ApiError(401, "Invalid JazzCash callback signature");
  }
  if (!fields.pp_TxnRefNo) {
    throw new ApiError(400, "JazzCash callback is missing pp_TxnRefNo");
  }

  const intent = await getIntentByGatewayRef(fields.pp_TxnRefNo);
  await recordGatewayResponse(intent.id, fields.pp_ResponseCode || null);

  // Confirmed directly from the guide's own field description (not guessed): "A response
  // code of 000 represents success." Anything else — decline, timeout, cancellation — just
  // leaves gateway_response_code recorded above for the Pending Bank Payments page; the
  // intent stays 'awaiting_payment' so the same customer can simply retry, same "record it,
  // let a human decide" shape flagAmbiguous already uses for a genuinely ambiguous match.
  if (fields.pp_ResponseCode !== "000") {
    return res.send({ received: true, confirmed: false, responseCode: fields.pp_ResponseCode });
  }

  try {
    const confirmed = await confirmIntent(intent.id, {
      requestingUser: null,
      autoConfirmed: true,
      matchedSourceText: `JazzCash callback pp_TxnRefNo=${fields.pp_TxnRefNo} pp_ResponseCode=${fields.pp_ResponseCode}`,
    });
    res.send({ received: true, confirmed: true, receiptNo: confirmed.receiptNo });
  } catch (err) {
    // A webhook can legitimately be retried by the gateway itself — an already-confirmed
    // intent here just means an earlier delivery of this exact callback already succeeded,
    // not a real error, so it's reported as success rather than surfaced as a 409.
    if (err instanceof ApiError && err.status === 409) {
      return res.send({ received: true, confirmed: true, alreadyConfirmed: true });
    }
    throw err;
  }
});

// Easypaisa's exact initiate/callback field names aren't implementable yet — their own
// Merchant Integration Guide (only available inside the merchant portal after signup)
// hasn't been read the way JazzCash's was this session. These stubs exist so the route
// shape/channel value ('easypaisa') is already wired end-to-end (schema, bankPaymentService,
// routes) and filling them in later is a service-file change only — see plan.md's
// non-goals. Deliberately fail-closed (503, same pattern as jazzCashService.getConfig)
// rather than silently accepting a payment method that can't actually be verified yet.
const InitiateEasypaisaPayment = asyncHandler(async () => {
  throw new ApiError(503, "Easypaisa isn't wired up yet — pending their own Merchant Integration Guide");
});

const EasypaisaCallback = asyncHandler(async () => {
  throw new ApiError(503, "Easypaisa isn't wired up yet — pending their own Merchant Integration Guide");
});

module.exports = {
  InitiateJazzCashPayment,
  JazzCashCallback,
  InitiateEasypaisaPayment,
  EasypaisaCallback,
};
