const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { recentServerErrorsFor } = require("./monitoringService");

// Support tickets (migrations 034, 035): a shop's bug reports and feature requests, tracked
// by status. The shop describes the problem once (text, screenshots, and the app's
// diagnostic log if they allow it); the platform admin moves it through the statuses, and the
// shop follows that. There's no conversation on a ticket.
//
// Who sees what: any staff member can open a ticket; a cashier sees the ones they opened, the
// owner every ticket of the shop. Shop-side reads and writes run in the shop's own context
// (requireAuth → Db.js tenant), so row-level security keeps them to the shop as well. The
// admin side spans every shop and runs as the platform admin, outside any shop context.
//
// History is the event list: the report's description is its first message, and every status
// change after it is another event (from what, to what, when) — the status on the ticket is
// never changed without one.

const KINDS = ["bug", "feature"];
const STATUSES = ["open", "in_review", "planned", "in_progress", "resolved", "wont_fix"];
const CLOSED = ["resolved", "wont_fix"];
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_BODY = 5000;
const NEW_TICKETS_PER_HOUR = 10;
// The diagnostics a ticket keeps: the server's own errors for the shop from this far back,
// and at most this much of what the app sends (oldest log entries dropped first).
const SERVER_ERRORS_WINDOW_MS = 60 * 60 * 1000;
const MAX_DIAGNOSTICS_BYTES = 400 * 1024;
const ADMIN_PAGE_SIZE = 30;

// --- Input ------------------------------------------------------------------------------

const requireText = (value, { name, min, max }) => {
  const text = String(value ?? "").trim();
  if (text.length < min) throw new ApiError(400, `${name} is required${min > 1 ? ` (at least ${min} characters)` : ""}`);
  if (text.length > max) throw new ApiError(400, `${name} can be at most ${max} characters`);
  return text;
};

// The picture's type is read from its own first bytes, never taken from what the client says.
const sniffImage = (buf) => {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
};

// [{ data: base64 or data URL }] → [{ mime, buf }]
const decodeAttachments = (list) => {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new ApiError(400, "Attachments must be a list");
  if (list.length > MAX_ATTACHMENTS) throw new ApiError(400, `At most ${MAX_ATTACHMENTS} pictures per message`);
  return list.map((item) => {
    const buf = Buffer.from(String(item?.data ?? "").replace(/^data:[^,]*,/, ""), "base64");
    if (!buf.length) throw new ApiError(400, "A picture is empty");
    if (buf.length > MAX_ATTACHMENT_BYTES) throw new ApiError(400, "Each picture must be 2 MB or smaller");
    const mime = sniffImage(buf);
    if (!mime) throw new ApiError(400, "Pictures must be PNG, JPEG or WebP images");
    return { mime, buf };
  });
};

// Where the report came from, as the app tells it — a few short strings, nothing else kept.
const CONTEXT_FIELDS = ["page", "platform", "appVersion", "userAgent", "screen", "language"];
const cleanContext = (context) => {
  const out = {};
  for (const field of CONTEXT_FIELDS) {
    if (context?.[field] != null) out[field] = String(context[field]).slice(0, 300);
  }
  return out;
};

// What goes on a ticket for the admin (migration 035): the app's log and environment as the app
// sent it (`client`), a register's own report when the ticket came through one (`device` —
// only then: the register adds it, device/readThrough.js), and this server's errors for the
// shop over the last hour (`server`). Shown to the admin only, as text. Capped in size by
// dropping the oldest log entries.
const buildDiagnostics = ({ client, device, shopId }) => {
  const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const out = {
    server: { errors: recentServerErrorsFor(shopId, SERVER_ERRORS_WINDOW_MS), windowMinutes: SERVER_ERRORS_WINDOW_MS / 60000 },
  };
  if (isObject(client)) out.client = { ...client, entries: Array.isArray(client.entries) ? [...client.entries] : [] };
  if (isObject(device)) out.device = device;
  while (Buffer.byteLength(JSON.stringify(out)) > MAX_DIAGNOSTICS_BYTES && out.client?.entries?.length) {
    out.client.entries.splice(0, Math.max(1, Math.ceil(out.client.entries.length / 10)));
    out.client.truncated = true;
  }
  if (Buffer.byteLength(JSON.stringify(out)) > MAX_DIAGNOSTICS_BYTES) delete out.device;
  return out;
};

// --- Shared writes and reads ------------------------------------------------------------

const insertMessage = async (client, { ticketId, shopId, authorId, side, body, attachments }) => {
  const { rows } = await client.query(
    `INSERT INTO support_ticket_events (ticket_id, shop_id, author_id, author_side, kind, body)
     VALUES ($1, $2, $3, $4, 'message', $5) RETURNING id`,
    [ticketId, shopId, authorId, side, body]
  );
  for (const { mime, buf } of attachments) {
    await client.query(
      `INSERT INTO support_attachments (event_id, ticket_id, shop_id, mime, size, data) VALUES ($1, $2, $3, $4, $5, $6)`,
      [rows[0].id, ticketId, shopId, mime, buf.length, buf]
    );
  }
};

const insertStatusChange = (client, { ticketId, shopId, authorId, side, from, to }) =>
  client.query(
    `INSERT INTO support_ticket_events (ticket_id, shop_id, author_id, author_side, kind, from_status, to_status)
     VALUES ($1, $2, $3, $4, 'status', $5, $6)`,
    [ticketId, shopId, authorId, side, from, to]
  );

const markShopRead = (db, { ticketId, userId, shopId }) =>
  db.query(
    `INSERT INTO support_ticket_reads (ticket_id, user_id, shop_id, read_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (ticket_id, user_id) DO UPDATE SET read_at = NOW()`,
    [ticketId, userId, shopId]
  );

// The ticket's history, oldest first, with each message's pictures (ids only — they're
// fetched one by one). A platform admin's name is never shown to a shop: on the shop side the
// users row isn't even visible (row-level security), and the page shows "Support".
const loadEvents = async (db, ticketId) => {
  const [{ rows: events }, { rows: files }] = await Promise.all([
    db.query(
      `SELECT e.id, e.author_side, e.kind, e.body, e.from_status, e.to_status, e.created_at,
              CASE WHEN e.author_side = 'shop' THEN u.display_name END AS author_name
       FROM support_ticket_events e
       LEFT JOIN users u ON u.id = e.author_id
       WHERE e.ticket_id = $1
       ORDER BY e.id`,
      [ticketId]
    ),
    db.query(`SELECT id, event_id, mime, size FROM support_attachments WHERE ticket_id = $1 ORDER BY id`, [ticketId]),
  ]);
  return events.map((e) => ({ ...e, attachments: files.filter((f) => String(f.event_id) === String(e.id)).map(({ id, mime, size }) => ({ id, mime, size })) }));
};

const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err instanceof ApiError ? err : new ApiError(500, err.message);
  } finally {
    client.release();
  }
};

// --- Shop side --------------------------------------------------------------------------

// A cashier's tickets are the ones they opened; the owner's are all of the shop's.
const visibility = (user, params) => {
  params.push(user.shopId);
  let where = `t.shop_id = $${params.length}`;
  if (user.role !== "owner") {
    params.push(user.id);
    where += ` AND t.opened_by = $${params.length}`;
  }
  return where;
};

const findVisibleTicket = async (db, user, ticketId, { lock = false } = {}) => {
  const params = [idOf(ticketId)];
  const { rows } = await db.query(
    `SELECT t.* FROM support_tickets t WHERE t.id = $1 AND ${visibility(user, params)}${lock ? " FOR UPDATE" : ""}`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Ticket not found");
  return rows[0];
};

// `diagnostics` is what the app sends (null when the person chose not to); `deviceReport` is
// only ever passed by the controller for a ticket that came through a register.
const createTicket = async (user, { kind, title, body, attachments, context, diagnostics, deviceReport }) => {
  if (!KINDS.includes(kind)) throw new ApiError(400, "Choose whether this is a bug or a feature request");
  const cleanTitle = requireText(title, { name: "Title", min: 3, max: 150 });
  const cleanBody = requireText(body, { name: "Description", min: 1, max: MAX_BODY });
  const files = decodeAttachments(attachments);

  const { rows: recent } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM support_tickets WHERE shop_id = $1 AND opened_by = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
    [user.shopId, user.id]
  );
  if (recent[0].n >= NEW_TICKETS_PER_HOUR) throw new ApiError(429, "You've opened a lot of tickets in the last hour — please wait a little before opening another");

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO support_tickets (shop_id, kind, title, opened_by, context, diagnostics) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        user.shopId,
        kind,
        cleanTitle,
        user.id,
        cleanContext(context),
        diagnostics == null ? null : buildDiagnostics({ client: diagnostics, device: deviceReport, shopId: user.shopId }),
      ]
    );
    const ticketId = rows[0].id;
    await insertMessage(client, { ticketId, shopId: user.shopId, authorId: user.id, side: "shop", body: cleanBody, attachments: files });
    await markShopRead(client, { ticketId, userId: user.id, shopId: user.shopId });
    return { id: ticketId };
  });
};

// state: "active" (not resolved/declined), "closed", or anything else for all of them.
const stateFilter = (state, params) => {
  if (state !== "closed" && state !== "active") return null;
  params.push(CLOSED);
  const closed = `t.status = ANY($${params.length}::text[])`;
  return state === "closed" ? closed : `NOT ${closed}`;
};

// Ids arrive from the URL; anything that isn't one is simply not found (not a database error).
const idOf = (value, what = "Ticket") => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(404, `${what} not found`);
  return id;
};

const listShopTickets = async (user, { state = "all" } = {}) => {
  const params = [user.id];
  const where = [visibility(user, params), stateFilter(state, params)].filter(Boolean).join(" AND ");
  const { rows } = await pool.query(
    `SELECT t.id, t.kind, t.title, t.status, t.created_at, t.last_event_at, t.last_event_side,
            u.display_name AS opened_by_name, t.opened_by = $1 AS mine,
            (t.last_event_side = 'admin' AND (r.read_at IS NULL OR r.read_at < t.last_event_at)) AS unread
     FROM support_tickets t
     LEFT JOIN users u ON u.id = t.opened_by
     LEFT JOIN support_ticket_reads r ON r.ticket_id = t.id AND r.user_id = $1
     WHERE ${where}
     ORDER BY t.last_event_at DESC
     LIMIT 200`,
    params
  );
  return rows;
};

const getShopTicket = async (user, ticketId) => {
  const ticket = await findVisibleTicket(pool, user, ticketId);
  const [{ rows: opener }, events] = await Promise.all([
    pool.query(`SELECT display_name FROM users WHERE id = $1`, [ticket.opened_by]),
    loadEvents(pool, ticket.id),
  ]);
  await markShopRead(pool, { ticketId: ticket.id, userId: user.id, shopId: user.shopId });
  // The diagnostics are for the admin; the shop sees whether they were sent, not their content.
  const { admin_read_at: _adminRead, diagnostics, ...visible } = ticket;
  return { ...visible, has_diagnostics: diagnostics != null, opened_by_name: opener[0]?.display_name ?? null, events };
};

// Tickets whose status changed since this user last looked (the header badge).
const shopUnreadCount = async (user) => {
  const params = [user.id];
  const where = visibility(user, params);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM support_tickets t
     LEFT JOIN support_ticket_reads r ON r.ticket_id = t.id AND r.user_id = $1
     WHERE ${where} AND t.last_event_side = 'admin' AND (r.read_at IS NULL OR r.read_at < t.last_event_at)`,
    params
  );
  return rows[0].n;
};

const getShopAttachment = async (user, attachmentId) => {
  const params = [idOf(attachmentId, "Picture")];
  const { rows } = await pool.query(
    `SELECT a.mime, a.data FROM support_attachments a JOIN support_tickets t ON t.id = a.ticket_id
     WHERE a.id = $1 AND ${visibility(user, params)}`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Picture not found");
  return rows[0];
};

// --- Platform admin side (every shop; runs outside any shop context) --------------------

const adminListTickets = async ({ state = "active", kind, shopId, q, page = 1 } = {}) => {
  const params = [];
  const conditions = ["TRUE"];
  if (STATUSES.includes(state)) {
    params.push(state);
    conditions.push(`t.status = $${params.length}`);
  } else {
    const filter = stateFilter(state, params);
    if (filter) conditions.push(filter);
  }
  if (KINDS.includes(kind)) {
    params.push(kind);
    conditions.push(`t.kind = $${params.length}`);
  }
  if (shopId) {
    params.push(Number(shopId));
    conditions.push(`t.shop_id = $${params.length}`);
  }
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    conditions.push(`(t.title ILIKE $${params.length} OR s.name ILIKE $${params.length})`);
  }
  const where = conditions.join(" AND ");
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const [{ rows }, { rows: count }] = await Promise.all([
    pool.query(
      `SELECT t.id, t.kind, t.title, t.status, t.created_at, t.last_event_at, t.last_event_side, t.shop_id,
              s.name AS shop_name, u.display_name AS opened_by_name, u.role AS opened_by_role,
              (t.last_event_side = 'shop' AND (t.admin_read_at IS NULL OR t.admin_read_at < t.last_event_at)) AS unread
       FROM support_tickets t
       JOIN shops s ON s.id = t.shop_id
       LEFT JOIN users u ON u.id = t.opened_by
       WHERE ${where}
       ORDER BY unread DESC, t.last_event_at DESC
       LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(safePage - 1) * ADMIN_PAGE_SIZE}`,
      params
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM support_tickets t JOIN shops s ON s.id = t.shop_id WHERE ${where}`, params),
  ]);
  const totalCount = count[0].n;
  return { tickets: rows, totalCount, page: safePage, totalPages: Math.max(1, Math.ceil(totalCount / ADMIN_PAGE_SIZE)) };
};

const findTicket = async (db, ticketId, { lock = false } = {}) => {
  const { rows } = await db.query(`SELECT * FROM support_tickets WHERE id = $1${lock ? " FOR UPDATE" : ""}`, [idOf(ticketId)]);
  if (!rows[0]) throw new ApiError(404, "Ticket not found");
  return rows[0];
};

const adminGetTicket = async (ticketId) => {
  const ticket = await findTicket(pool, ticketId);
  const [{ rows: meta }, events] = await Promise.all([
    pool.query(
      `SELECT s.name AS shop_name, s.tier AS shop_tier, u.display_name AS opened_by_name, u.username AS opened_by_username, u.role AS opened_by_role
       FROM shops s LEFT JOIN users u ON u.id = $2 WHERE s.id = $1`,
      [ticket.shop_id, ticket.opened_by]
    ),
    loadEvents(pool, ticket.id),
  ]);
  await pool.query(`UPDATE support_tickets SET admin_read_at = NOW() WHERE id = $1`, [ticket.id]);
  return { ...ticket, ...meta[0], events };
};

// The admin moves the ticket to another status; the shop sees the change (and is told once).
const adminSetStatus = async (admin, ticketId, { status }) => {
  if (!STATUSES.includes(status)) throw new ApiError(400, `Unknown status "${status}"`);
  await withTransaction(async (client) => {
    const ticket = await findTicket(client, ticketId, { lock: true });
    if (ticket.status === status) throw new ApiError(400, "The ticket already has that status");
    await insertStatusChange(client, { ticketId: ticket.id, shopId: ticket.shop_id, authorId: admin.id, side: "admin", from: ticket.status, to: status });
    await client.query(
      `UPDATE support_tickets SET status = $2, last_event_at = NOW(), last_event_side = 'admin', admin_read_at = NOW() WHERE id = $1`,
      [ticket.id, status]
    );
  });
  return adminGetTicket(ticketId);
};

const adminUnreadCount = async () => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM support_tickets
     WHERE last_event_side = 'shop' AND (admin_read_at IS NULL OR admin_read_at < last_event_at)`
  );
  return rows[0].n;
};

const adminGetAttachment = async (attachmentId) => {
  const { rows } = await pool.query(`SELECT mime, data FROM support_attachments WHERE id = $1`, [idOf(attachmentId, "Picture")]);
  if (!rows[0]) throw new ApiError(404, "Picture not found");
  return rows[0];
};

module.exports = {
  KINDS,
  STATUSES,
  createTicket,
  listShopTickets,
  getShopTicket,
  shopUnreadCount,
  getShopAttachment,
  adminListTickets,
  adminGetTicket,
  adminSetStatus,
  adminUnreadCount,
  adminGetAttachment,
};
