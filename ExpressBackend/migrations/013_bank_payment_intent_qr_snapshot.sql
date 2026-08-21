-- Lets the Pending Bank Payments page re-show the EXACT same QR a cashier already
-- generated (clicking a row re-opens BankTransferQrModal with this stored image) instead
-- of regenerating one — regenerating from current bank settings could silently show
-- different account details if the owner edits Company > Bank Account in between, which
-- would be actively wrong for an already-shown, still-pending payment. Same "freeze what
-- was true at creation time" reasoning as cart_snapshot on this same table (migration 012).
-- An ALTER on top of 012, not a rework — mirrors how refunds (migration 009) got contact_id
-- added two migrations later (011) rather than redesigned in place.
-- Safe to re-run: guarded with IF NOT EXISTS.

ALTER TABLE bank_payment_intents ADD COLUMN IF NOT EXISTS qr_data_url TEXT;
