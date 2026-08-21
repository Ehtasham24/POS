const { pool } = require("../../Db");
const { getParser } = require("./parsers");
const { confirmIntent, flagAmbiguous } = require("../bankPaymentService");

// Generous "don't match a stale old intent" heuristic, not a cancellation mechanism —
// same constant/reasoning plan.md specified for the (superseded) Gmail matcher. A
// pending bank-transfer intent itself never expires (see bank_payment_intents' own
// comment) — this only bounds how far back a NEW notification is allowed to reach.
const MATCH_WINDOW_HOURS = 72;

// The one place an incoming phone notification/SMS turns into either an auto-confirmed
// sale or a flagged ambiguity — called by Controller/paymentNotificationController.js
// after the shared-secret check. Deliberately mirrors the (superseded) Gmail design in
// plan.md exactly: parse → find awaiting_payment intents at the same amount within the
// window → zero matches does nothing, exactly one auto-confirms via the SAME
// confirmIntent() the manual "Mark as Paid" button calls, more than one flips every
// intent involved to 'ambiguous' and never guesses.
const handleIncomingNotification = async ({ packageName, title, text, postedAt }) => {
  const fullText = [title, text].filter(Boolean).join(" — ");
  const parser = getParser(packageName);

  if (!parser.canParse(fullText)) {
    return { matched: false, reason: "unparseable", parserUsed: parser.key };
  }
  const parsed = parser.parse(fullText);
  if (!parsed) {
    return { matched: false, reason: "unparseable", parserUsed: parser.key };
  }

  const receivedAt = postedAt ? new Date(postedAt) : new Date();

  // Only 'awaiting_payment' — an already-'ambiguous' intent stays that way until a human
  // resolves it (requeueIntent), rather than a second notification trying to guess which
  // of the earlier candidates it belongs to. See this file's header comment for why a
  // second same-amount notification after an ambiguity is a safe no-op, not a bug.
  const { rows: candidates } = await pool.query(
    `SELECT * FROM bank_payment_intents
     WHERE status = 'awaiting_payment'
       AND amount = $1
       AND created_at <= $2
       AND created_at >= $2::timestamp - ($3 || ' hours')::interval
     ORDER BY created_at ASC`,
    [parsed.amount, receivedAt, MATCH_WINDOW_HOURS]
  );

  if (candidates.length === 0) {
    return { matched: false, reason: "no_pending_intent_at_that_amount", amount: parsed.amount };
  }

  if (candidates.length === 1) {
    const intent = candidates[0];
    try {
      const confirmed = await confirmIntent(intent.id, {
        requestingUser: null,
        autoConfirmed: true,
        matchedSourceText: fullText,
      });
      return { matched: true, outcome: "confirmed", intentId: intent.id, receiptNo: confirmed.receiptNo };
    } catch (err) {
      // confirmIntent's own stock/voucher-conflict handling already recorded
      // last_confirm_error on the intent — nothing further to do here except report it
      // rather than letting the webhook response look like a plain success.
      return { matched: true, outcome: "confirm_failed", intentId: intent.id, error: err.message };
    }
  }

  // More than one candidate at the same amount in the same window — genuinely ambiguous,
  // never guess which one this notification was for.
  const candidateSummary = candidates.map((c) => ({ intentId: c.id, createdAt: c.created_at }));
  await flagAmbiguous(
    Object.fromEntries(
      candidates.map((c) => [
        c.id,
        { notification: fullText, receivedAt, alsoMatchedIntentIds: candidates.filter((o) => o.id !== c.id).map((o) => o.id) },
      ])
    )
  );
  return { matched: true, outcome: "ambiguous", candidates: candidateSummary };
};

module.exports = { handleIncomingNotification, MATCH_WINDOW_HOURS };
