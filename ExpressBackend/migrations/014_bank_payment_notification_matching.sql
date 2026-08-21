-- Bookkeeping for the phone-based notification-forwarder auto-matcher (see
-- Sevices/PaymentNotifications/). An ALTER on top of 012/013, not a rework — same
-- "grow the table later" pattern as refunds (migration 009) getting contact_id two
-- migrations later (011).
-- Safe to re-run: guarded with IF NOT EXISTS.

-- Populated on a successful auto-confirm — the raw notification/SMS text that triggered
-- it, kept for audit ("why did the system think this was paid?") the same way
-- last_confirm_error already makes a failed attempt visible rather than silent.
ALTER TABLE bank_payment_intents ADD COLUMN IF NOT EXISTS matched_source_text TEXT;

-- Populated only when status flips to 'ambiguous' — every conflicting notification/
-- intent pair involved, so the Pending Bank Payments page can render "these N pending
-- payments and these N incoming notifications matched each other, pick which is which"
-- without re-deriving it from scratch.
ALTER TABLE bank_payment_intents ADD COLUMN IF NOT EXISTS match_candidates JSONB;
