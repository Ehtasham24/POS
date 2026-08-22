const crypto = require("crypto");
const ApiError = require("../../../utils/ApiError");

// JazzCash Payment Portal (Mobile Wallet / pp_TxnType=MWALLET) integration — see
// plan.md's "JazzCash + Easypaisa merchant integration" section for the full research
// this is built from (the real 94-page "Payment Gateway Integration Guide for
// Merchants-v4.2.pdf", read in full, not guessed at). Sandbox-only for now
// (JAZZCASH_ENV must be "sandbox" or "production" — no other value is accepted, so a
// typo can't accidentally hit production).
//
// Deliberately NOT following the existing Sevices/ThirdParty/PayFast/ scaffolding —
// confirmed dead/broken (calls an undefined postPayment(), a stray second pg.Pool with
// different env vars than Db.js). This is a fresh implementation against this app's own
// established conventions (ApiError, no bespoke DB connections).

// No hardcoded base URL here, sandbox or production — JazzCash issues each merchant
// their OWN Sandbox URL and Production URL directly (see plan.md's signup section),
// alongside Merchant ID/Password/Integrity Salt. The only URL confirmed from the actual
// 94-page guide during this session's research was for a *different* API family (the
// newer JSON Card/tokenization endpoints, all under payaxisapplicationapi) — not the
// classic Payment Portal (pp_TxnType=MWALLET) flow this file targets, so guessing one
// here would be exactly the kind of unverified assumption to avoid. Both come from env
// vars, filled in once real credentials exist.
const getConfig = () => {
  const env = process.env.JAZZCASH_ENV || "sandbox";
  if (env !== "sandbox" && env !== "production") {
    throw new ApiError(503, `JAZZCASH_ENV must be "sandbox" or "production", got "${env}"`);
  }
  const merchantId = process.env.JAZZCASH_MERCHANT_ID;
  const password = process.env.JAZZCASH_PASSWORD;
  const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT;
  const baseUrl = env === "sandbox" ? process.env.JAZZCASH_SANDBOX_URL : process.env.JAZZCASH_PRODUCTION_URL;
  // Per the guide: "part of this URL is to be provided to PMCL before transaction
  // processing starts" — pp_ReturnURL has to be pre-registered with JazzCash, so it's a
  // fixed env var (pointed at Routes/API/paymentGatewayRoutes.js's callback route through
  // whatever's currently reachable from JazzCash's servers — ngrok while testing, the real
  // domain once live), never constructed per-request from the incoming request itself.
  const returnUrl = process.env.JAZZCASH_RETURN_URL;
  // Same fail-closed shape as requireForwarderSecret.js: unconfigured means every call
  // rejects cleanly, never silently proceeds with a blank/undefined credential.
  if (!merchantId || !password || !integritySalt || !baseUrl || !returnUrl) {
    throw new ApiError(503, "JazzCash isn't configured on this server yet");
  }
  return { env, merchantId, password, integritySalt, baseUrl, returnUrl };
};

// The exact algorithm from the guide's section 14.2 "How is SHA256-HMAC Calculated",
// verified against its own worked example before this was ever pointed at a real
// sandbox call:
//   fields   = { pp_Amount: "2995", pp_MerchantID: "MER123", pp_OrderInfo: "A48cvE28" }
//   salt     = "0F5DD14AE2"
//   -> sorted keys ascending by field name: pp_Amount, pp_MerchantID, pp_OrderInfo
//   -> values joined with '&':              "2995&MER123&A48cvE28"
//   -> salt + '&' prepended:   "0F5DD14AE2&2995&MER123&A48cvE28"   <- matches the PDF exactly
//   -> HMAC-SHA256 of that string, key = salt (UTF-8), hex-encoded  = pp_SecureHash
// Pure function — no network/DB — independently testable against the example above,
// which is exactly how this was verified this session (see plan.md).
const calculateSecureHash = (fields, integritySalt) => {
  const sortedKeys = Object.keys(fields)
    .filter((key) => key.startsWith("pp_") && fields[key] !== undefined && fields[key] !== null && fields[key] !== "")
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const joined = sortedKeys.map((key) => String(fields[key])).join("&");
  const message = `${integritySalt}&${joined}`;
  return crypto
    .createHmac("sha256", Buffer.from(integritySalt, "utf8"))
    .update(Buffer.from(message, "utf8"))
    .digest("hex");
};

// yyyyMMddHHmmss — the exact format the guide's pp_TxnDateTime/pp_TxnExpiryDateTime
// fields require (confirmed from its own example: "9th Oct, 2011 10:35:47 PM" ->
// "20111009223547").
const formatJazzCashDateTime = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
};

// Builds the pp_* fields for a Mobile Wallet payment and signs them — does NOT make the
// actual HTTP call itself. The frontend POSTs the returned fields straight to
// getConfig().baseUrl (JazzCash's own hosted page); Controller/paymentGatewayController.js
// is what calls this, right after opening the intent.
//
// intent: a bank_payment_intents row (id, amount, gateway_txn_ref) with channel='jazzcash'.
const buildMobileWalletRequest = (intent) => {
  const { merchantId, password, integritySalt, returnUrl } = getConfig();
  const now = new Date();
  const fields = {
    pp_Version: "1.1",
    pp_TxnType: "MWALLET",
    pp_Language: "EN",
    pp_MerchantID: merchantId,
    pp_Password: password,
    pp_TxnRefNo: intent.gateway_txn_ref,
    // No decimal point — Rs.100.00 is sent as "10000" per the guide's own example.
    pp_Amount: String(Math.round(Number(intent.amount) * 100)),
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: formatJazzCashDateTime(now),
    pp_BillReference: `BTX-${String(intent.id).padStart(6, "0")}`,
    pp_Description: "POS sale",
    pp_ReturnURL: returnUrl,
  };
  const pp_SecureHash = calculateSecureHash(fields, integritySalt);
  return { ...fields, pp_SecureHash };
};

// Verifies an inbound callback really came from JazzCash — recomputes the hash from
// every pp_* field JazzCash sent back (excluding pp_SecureHash itself) and compares.
// Same fail-closed shape as Middleware/requireForwarderSecret.js's shared-secret check,
// just with a real cryptographic HMAC instead of a plain string comparison.
const verifyCallback = (fields) => {
  const { integritySalt } = getConfig();
  const { pp_SecureHash, ...rest } = fields;
  if (!pp_SecureHash) return false;
  const expected = calculateSecureHash(rest, integritySalt);
  // Constant-time comparison — a callback's hash is attacker-influenced input, so a
  // naive === here would leak timing information about how much of the hash matched.
  const a = Buffer.from(pp_SecureHash, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = {
  getConfig,
  calculateSecureHash,
  formatJazzCashDateTime,
  buildMobileWalletRequest,
  verifyCallback,
};
