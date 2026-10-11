-- What a support ticket carries for whoever answers it (Sevices/supportService.js): the app's
-- own diagnostic log from the minutes before the report (pages, requests and their results,
-- errors, what the user was shown), the environment it ran in, a register's sync state, and
-- the server errors logged for that shop around then. Never passwords, tokens or request
-- contents. Read by the platform admin only; NULL when the person chose not to send it.
--
-- pos_app already inserts whole rows into support_tickets (migration 034), so no new grant.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS diagnostics JSONB;
