-- Support tickets: a shop's bug reports and feature requests to the platform, and the
-- conversation about each one. Any staff member can open one; a cashier sees their own, the
-- owner every ticket of the shop; the platform admin sees all and answers (Sevices/
-- supportService.js).
--
--   support_tickets         one per report: what kind, its title, where it stands, where it
--                           was sent from (context: page, app, platform, version).
--   support_ticket_events   its history in order: messages (the first one is the report's
--                           description) and status changes, each with who and when.
--   support_attachments     screenshots on a message (images, bytes kept here; small, since
--                           the app shrinks them before sending).
--   support_ticket_reads    when each shop user last looked at a ticket, so a reply shows as
--                           new to whoever hasn't seen it (the admin side keeps one time on the
--                           ticket: admin_read_at).
--
-- Cloud only: a register reaches these through the cloud (device/readThrough.js), never from
-- its local database.

CREATE TABLE IF NOT EXISTS support_tickets (
  id              BIGSERIAL PRIMARY KEY,
  shop_id         INTEGER NOT NULL REFERENCES shops(id),
  kind            TEXT NOT NULL,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  opened_by       INTEGER NOT NULL REFERENCES users(id),
  context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The latest event, and which side wrote it: what "new reply" and the lists' order go by.
  last_event_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_side TEXT NOT NULL DEFAULT 'shop',
  admin_read_at   TIMESTAMPTZ,
  CONSTRAINT support_tickets_kind_check CHECK (kind IN ('bug', 'feature')),
  CONSTRAINT support_tickets_status_check CHECK (status IN ('open', 'in_review', 'planned', 'in_progress', 'resolved', 'wont_fix')),
  CONSTRAINT support_tickets_title_check CHECK (char_length(title) BETWEEN 3 AND 150),
  CONSTRAINT support_tickets_side_check CHECK (last_event_side IN ('shop', 'admin'))
);
-- A shop's list (newest activity first), and the admin's queue by status.
CREATE INDEX IF NOT EXISTS idx_support_tickets_shop ON support_tickets (shop_id, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status, last_event_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_events (
  id          BIGSERIAL PRIMARY KEY,
  ticket_id   BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  shop_id     INTEGER NOT NULL REFERENCES shops(id),
  author_id   INTEGER REFERENCES users(id),
  author_side TEXT NOT NULL,
  kind        TEXT NOT NULL,
  body        TEXT,
  from_status TEXT,
  to_status   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_events_side_check CHECK (author_side IN ('shop', 'admin')),
  CONSTRAINT support_events_kind_check CHECK (kind IN ('message', 'status')),
  CONSTRAINT support_events_body_check CHECK (
    (kind = 'message' AND char_length(body) BETWEEN 1 AND 5000) OR (kind = 'status' AND to_status IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_support_events_ticket ON support_ticket_events (ticket_id, id);

CREATE TABLE IF NOT EXISTS support_attachments (
  id         BIGSERIAL PRIMARY KEY,
  event_id   BIGINT NOT NULL REFERENCES support_ticket_events(id) ON DELETE CASCADE,
  ticket_id  BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  shop_id    INTEGER NOT NULL REFERENCES shops(id),
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_attachments_mime_check CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  CONSTRAINT support_attachments_size_check CHECK (size > 0 AND size <= 2097152)
);
CREATE INDEX IF NOT EXISTS idx_support_attachments_event ON support_attachments (event_id);

CREATE TABLE IF NOT EXISTS support_ticket_reads (
  ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id),
  shop_id   INTEGER NOT NULL REFERENCES shops(id),
  read_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticket_id, user_id)
);

-- ---------------------------------------------------------------------------------------
-- Row-level security: a shop reaches only its own tickets (as everywhere, migration 028).
-- Shops may open tickets and write messages, attachments and their read marks; changing a
-- ticket's status or the admin's read time is the platform admin's, who doesn't run as
-- pos_app — but a shop's reply reopens a closed ticket and moves last_event_*, so UPDATE is
-- granted on those columns only.
-- ---------------------------------------------------------------------------------------
GRANT SELECT, INSERT ON support_tickets TO pos_app;
GRANT UPDATE (status, last_event_at, last_event_side) ON support_tickets TO pos_app;
GRANT SELECT, INSERT ON support_ticket_events TO pos_app;
GRANT SELECT, INSERT ON support_attachments TO pos_app;
GRANT SELECT, INSERT, UPDATE ON support_ticket_reads TO pos_app;
GRANT USAGE ON SEQUENCE support_tickets_id_seq, support_ticket_events_id_seq, support_attachments_id_seq TO pos_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['support_tickets', 'support_ticket_events', 'support_attachments', 'support_ticket_reads'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS shop_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY shop_isolation ON %I TO pos_app
         USING (shop_id = app_shop_id()) WITH CHECK (shop_id = app_shop_id())',
      t
    );
  END LOOP;
END $$;
