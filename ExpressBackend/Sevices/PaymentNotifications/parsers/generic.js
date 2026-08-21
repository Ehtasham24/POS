// Best-effort fallback parser — not tuned against any real sample yet (unlike
// utils/bankQr.js's Raast payload, which IS reverse-engineered and CRC-verified against
// real Meezan/JazzCash QRs). Tries the pattern most Pakistani payment-received
// notifications share ("Rs." / "PKR" followed by a number, with optional thousands
// commas and a decimal part) and otherwise gives up rather than guessing wrong.
//
// This is registered as the default for any app/package that doesn't have its own
// tuned parser (see index.js's getParser) — replace it once real notification text
// samples are available (same reverse-engineering approach already used for the QR:
// share 2-3 real "payment received" notification texts, redacting the sender's own
// name/number if wanted, and a tuned parser can be written and verified against them).
const AMOUNT_PATTERN = /(?:Rs\.?|PKR)\s*([\d,]+(?:\.\d{1,2})?)/i;

const canParse = (text) => AMOUNT_PATTERN.test(text);

const parse = (text) => {
  const match = text.match(AMOUNT_PATTERN);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, raw: text };
};

module.exports = {
  key: "generic",
  label: "Generic (Rs./PKR amount match)",
  canParse,
  parse,
};
