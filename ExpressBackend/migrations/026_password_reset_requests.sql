-- Identity profile fields on users — nullable/backfillable. Existing accounts have none
-- of these until an admin fills them in via the Owner Profile editor (pages/Admin).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cnic TEXT;
-- CNIC is a real, nationally-unique government ID — same treatment as username, but only
-- enforced once actually provided (most accounts won't have one yet).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cnic ON users(cnic) WHERE cnic IS NOT NULL;

-- Set true only when a temp password is issued via the approved forgot-password flow
-- below; forces a mandatory password change before the account can do anything else
-- (enforced client-side — see clientSide's ProtectedRoute).
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- Mirrors bank_payment_intents' shape (migration 012) — same "user-submitted, admin
-- -reviewed" status lifecycle and resolved_by/resolved_at pattern.
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  shop_id        INTEGER REFERENCES shops(id), -- denormalized for admin display/filtering
  claimed_cnic   TEXT,
  claimed_phone  TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  requested_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_by    INTEGER REFERENCES users(id),
  resolved_at    TIMESTAMP,
  notes          TEXT,
  CONSTRAINT password_reset_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status ON password_reset_requests(status);
-- One open request per user at a time — same partial-unique-index pattern as shifts'
-- "one open shift per user" (migration 017), so resubmitting while pending is rejected
-- up front instead of piling up duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_one_pending_per_user
  ON password_reset_requests(user_id) WHERE status = 'pending';
