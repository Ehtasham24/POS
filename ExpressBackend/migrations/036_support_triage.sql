-- Triage for support tickets, all of it the platform admin's (Sevices/supportService.js):
--
--   priority      how soon it needs looking at. A bug report whose diagnostics show the app
--                 breaking (an uncaught error, a server error) starts at 'high'; everything
--                 else at 'normal'. Only the admin changes it.
--   admin_note    the admin's own note on the ticket ("looks like the printer driver"). Never
--                 shown to the shop.
--   duplicate_of  the same problem reported again (often by another shop): the ticket points
--                 at the main one and follows its status from then on, so every shop that
--                 reported it sees it move. Always one level deep — the main ticket is never
--                 itself a duplicate.
--
-- The shop's own reads list their columns and never return these. pos_app already inserts
-- whole rows into support_tickets (migration 034), so no new grant; it never sets these.

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_of BIGINT REFERENCES support_tickets(id) ON DELETE SET NULL;

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_priority_check,
  ADD CONSTRAINT support_tickets_priority_check CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  DROP CONSTRAINT IF EXISTS support_tickets_admin_note_check,
  ADD CONSTRAINT support_tickets_admin_note_check CHECK (char_length(admin_note) <= 2000),
  DROP CONSTRAINT IF EXISTS support_tickets_duplicate_check,
  ADD CONSTRAINT support_tickets_duplicate_check CHECK (duplicate_of <> id);

-- A main ticket's duplicates (its "reported by N shops" count, and passing its status on).
CREATE INDEX IF NOT EXISTS idx_support_tickets_duplicate_of ON support_tickets (duplicate_of) WHERE duplicate_of IS NOT NULL;
