// Best-effort fallback parser. Verified against real samples on 2026-08-22, pulled from an
// actual phone's SMS inbox (JazzCash shortcode 8558, Meezan Bank/RAAST shortcode 8079):
//   "Rs 16.00 received from MUHAMMAD MAZ, A/C: *******7127 on 22/08/2026 at 01:42:47.
//    TID:721446549618 via JazzCash"                                    (JazzCash, incoming)
//   "PKR 90.00 sent to M.ZUBAIR PK65TMFBxx246 as RAAST payment from your
//    AC# xxx9971 of GULSHAN BLK2 KHI on 22-Aug-2026 at 00:10 TID:487364."  (Meezan, outgoing)
// The amount pattern alone ("Rs."/"PKR" + a number) matches both — but the second one is
// money LEAVING the account. Meezan's shortcode sends both directions from the same
// sender, so without this direction check, an outgoing transfer could accidentally match
// (and auto-confirm) a pending incoming sale of the same amount. Requiring
// "received"/"credited" and rejecting "sent" is a direct, real-evidence-backed guard
// against that, not just a generic improvement.
//
// This is registered as the default for any app/package/SMS-sender that doesn't have its
// own further-tuned parser (see index.js's getParser) — replace it once a specific bank's
// phrasing needs something more precise (e.g. multiple amounts in one message).
const AMOUNT_PATTERN = /(?:Rs\.?|PKR)\s*([\d,]+(?:\.\d{1,2})?)/i;
const RECEIVED_PATTERN = /\b(received|credited)\b/i;
const SENT_PATTERN = /\bsent\b/i;

const looksLikeIncomingPayment = (text) =>
  AMOUNT_PATTERN.test(text) && RECEIVED_PATTERN.test(text) && !SENT_PATTERN.test(text);

const canParse = looksLikeIncomingPayment;

const parse = (text) => {
  if (!looksLikeIncomingPayment(text)) return null;
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
