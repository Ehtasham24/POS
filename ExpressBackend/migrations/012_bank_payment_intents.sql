-- Bank-transfer QR checkout: a "payment intent" opened at checkout when the customer
-- chooses to pay via bank transfer (scan a QR) instead of cash/card. Deliberately NOT
-- sales/sale_transactions rows — those are only created once payment is confirmed (see
-- Sevices/bankPaymentService.js's confirmIntent, which calls the SAME checkoutSale() every
-- cash/card sale already goes through — there is exactly one place in the whole app that
-- ever creates a real sale). Until confirmed, this row is the only record a bank-transfer
-- sale was ever attempted; no stock is reserved/decremented and no revenue is recorded.
--
-- No expires_at / auto-cancel column here, deliberately — confirmed product decision: a
-- bank confirmation email/manual check can legitimately happen late, and wrongly voiding a
-- real payment is far worse than a stale-looking intent sitting in "awaiting_payment"
-- indefinitely. Only a human (cancelIntent) or a future email match (confirmIntent) ever
-- resolves one.
--
-- No reference_code column — a display reference is computed at read time from the row's
-- own SERIAL id ("BTX-" + id, zero-padded), mirroring formatReceiptNo/formatRefundNo in
-- salesService.js (same "Postgres already allocates this atomically, don't invent a second
-- counter" reasoning).
--
-- Safe to re-run: guarded with IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS bank_payment_intents (
  id                    SERIAL PRIMARY KEY,
  status                TEXT NOT NULL DEFAULT 'awaiting_payment',
  -- Exact shape checkoutSale's own `items` param expects
  -- ([{sellingPrice, quantity, productID, lotId}, ...]) — stored verbatim at intent-creation
  -- time so confirmIntent can hand it straight to checkoutSale unchanged, with no
  -- transformation step that could drift from what the customer saw on the QR screen.
  cart_snapshot         JSONB NOT NULL,
  -- What must actually arrive via bank transfer — cart total minus any store credit applied
  -- (mirrors checkoutSale's own creditToApply reduction). This is the number the QR is
  -- generated for.
  amount                NUMERIC NOT NULL,
  voucher_code          TEXT,
  store_credit_redeemed NUMERIC,
  created_by            INTEGER REFERENCES users(id),
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  -- NULL when/if ever auto-confirmed by a future email matcher rather than a human.
  resolved_by           INTEGER REFERENCES users(id),
  resolved_at           TIMESTAMP,
  resolution_note       TEXT,
  auto_confirmed        BOOLEAN NOT NULL DEFAULT false,
  -- Set only once status = 'confirmed' — the sale_transactions row confirmIntent's
  -- checkoutSale call actually created.
  transaction_id        INTEGER REFERENCES sale_transactions(id),
  -- Populated when a confirm ATTEMPT fails after this intent looked resolvable — e.g.
  -- checkoutSale threw "insufficient inventory" because a concurrent cash sale (or a second
  -- bank-transfer intent) already claimed the same stock. Status stays 'awaiting_payment' so
  -- nothing is silently lost, but this makes the failure visible in the Pending Bank
  -- Payments page instead of looking identical to "no attempt yet made."
  last_confirm_error    TEXT,
  CONSTRAINT bank_payment_intents_status_check
    CHECK (status IN ('awaiting_payment', 'confirmed', 'cancelled', 'ambiguous')),
  CONSTRAINT bank_payment_intents_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_bank_payment_intents_status ON bank_payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_bank_payment_intents_created_at ON bank_payment_intents(created_at);
