-- Extends bank_payment_intents to cover JazzCash/Easypaisa merchant-API payments
-- alongside the existing Raast-QR + phone-forwarder flow, rather than building a
-- second parallel "pending payment" table. See plan.md's JazzCash/Easypaisa section
-- for why: the pending-intent -> external-confirmation -> confirmIntent() shape is
-- identical either way, only *how* the intent is created/confirmed differs.
ALTER TABLE bank_payment_intents ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'bank_transfer';
-- 'bank_transfer' (existing Raast QR + phone-forwarder), 'jazzcash', 'easypaisa'.
-- Existing rows all default to 'bank_transfer' — zero behavior change for what's
-- already shipped.

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, unlike ADD COLUMN — guarded manually
-- so re-running this migration stays a safe no-op, same as every other migration here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_payment_intents_channel_check'
  ) THEN
    ALTER TABLE bank_payment_intents
      ADD CONSTRAINT bank_payment_intents_channel_check
      CHECK (channel IN ('bank_transfer', 'jazzcash', 'easypaisa'));
  END IF;
END $$;

-- Our own reference sent to the gateway (JazzCash's pp_TxnRefNo, Easypaisa's order id) —
-- how a gateway's webhook callback gets matched back to the intent that created it.
ALTER TABLE bank_payment_intents ADD COLUMN IF NOT EXISTS gateway_txn_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_bank_payment_intents_gateway_txn_ref ON bank_payment_intents(gateway_txn_ref);

-- Last known status/response code the gateway itself reported (JazzCash's
-- pp_ResponseCode or equivalent) — kept for support/debugging a declined or stuck
-- payment, distinct from last_confirm_error (which is about our own checkoutSale()
-- failing, e.g. a stock conflict, after the gateway already said the payment succeeded).
ALTER TABLE bank_payment_intents ADD COLUMN IF NOT EXISTS gateway_response_code TEXT;
