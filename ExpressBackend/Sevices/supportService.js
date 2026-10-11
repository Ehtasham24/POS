const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");

// Support tickets (migration 034): a shop's bug reports and feature requests, and the
// conversation about each one with the platform admin.
//
// Who sees what: any staff member can open a ticket; a cashier sees the ones they opened, the
// owner every ticket of the shop. Shop-side reads and writes run in the shop's own context
// (requireAuth → Db.js tenant), so row-level security keeps them to the shop as well. The
// admin side spans every shop and runs as the platform admin, outside any shop context.
//
// History is the event list: the report's description is its first message, and every later
// message and status change is another event — nothing on the ticket is overwritten without
// an event saying so.

const KINDS = ["bug", "feature"];
const STATUSES = ["open", "in_review", "planned", "in_progress", "resolved", "wont_fix"];
const CLOSED = ["resolved", "wont_fix"];
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_BODY = 5000;
const NEW_TICKETS_PER_HOUR = 10;
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

const createTicket = async (user, { kind, title, body, attachments, context }) => {
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
      `INSERT INTO support_tickets (shop_id, kind, title, opened_by, context) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [user.shopId, kind, cleanTitle, user.id, cleanContext(context)]
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
            (t.last_event_side = 'admin' AND (r.read_at IS NULL OR r.read_at < t.last_event_at)) AS unread,
            (SELECT COUNT(*)::int FROM support_ticket_events e WHERE e.ticket_id = t.id AND e.kind = 'message') AS messages
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
  const { admin_read_at: _adminRead, ...visible } = ticket;
  return { ...visible, opened_by_name: opener[0]?.display_name ?? null, events };
};

// A reply on a resolved or declined ticket reopens it: the shop is saying it isn't done.
const replyAsShop = async (user, ticketId, { body, attachments }) => {
  const cleanBody = requireText(body, { name: "Message", min: 1, max: MAX_BODY });
  const files = decodeAttachments(attachments);
  await withTransaction(async (client) => {
    const ticket = await findVisibleTicket(client, user, ticketId, { lock: true });
    await insertMessage(client, { ticketId: ticket.id, shopId: user.shopId, authorId: user.id, side: "shop", body: cleanBody, attachments: files });
    if (CLOSED.includes(ticket.status)) {
      await insertStatusChange(client, { ticketId: ticket.id, shopId: user.shopId, authorId: user.id, side: "shop", from: ticket.status, to: "open" });
    }
    await client.query(
      `UPDATE support_tickets SET last_event_at = NOW(), last_event_side = 'shop', status = CASE WHEN status = ANY($2::text[]) THEN 'open' ELSE status END WHERE id = $1`,
      [ticket.id, CLOSED]
    );
    await markShopRead(client, { ticketId: ticket.id, userId: user.id, shopId: user.shopId });
  });
  return getShopTicket(user, ticketId);
};

// Tickets with an answer this user hasn't seen yet (the header badge).
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
              (t.last_event_side = 'shop' AND (t.admin_read_at IS NULL OR t.admin_read_at < t.last_event_at)) AS unread,
              (SELECT COUNT(*)::int FROM support_ticket_events e WHERE e.ticket_id = t.id AND e.kind = 'message') AS messages
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

// One call for the admin's reply and/or status change, so both land as one step in the
// history and the shop is told once.
const adminUpdateTicket = async (admin, ticketId, { body, attachments, status }) => {
  const hasBody = String(body ?? "").trim().length > 0;
  const files = decodeAttachments(attachments);
  if (status != null && !STATUSES.includes(status)) throw new ApiError(400, `Unknown status "${status}"`);
  if (!hasBody && files.length) throw new ApiError(400, "Write a message to go with the pictures");
  await withTransaction(async (client) => {
    const ticket = await findTicket(client, ticketId, { lock: true });
    const changesStatus = status != null && status !== ticket.status;
    if (!hasBody && !changesStatus) throw new ApiError(400, "Write a message or change the status");
    if (hasBody) {
      const cleanBody = requireText(body, { name: "Message", min: 1, max: MAX_BODY });
      await insertMessage(client, { ticketId: ticket.id, shopId: ticket.shop_id, authorId: admin.id, side: "admin", body: cleanBody, attachments: files });
    }
    if (changesStatus) {
      await insertStatusChange(client, { ticketId: ticket.id, shopId: ticket.shop_id, authorId: admin.id, side: "admin", from: ticket.status, to: status });
    }
    await client.query(
      `UPDATE support_tickets SET status = $2, last_event_at = NOW(), last_event_side = 'admin', admin_read_at = NOW() WHERE id = $1`,
      [ticket.id, changesStatus ? status : ticket.status]
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
  replyAsShop,
  shopUnreadCount,
  getShopAttachment,
  adminListTickets,
  adminGetTicket,
  adminUpdateTicket,
  adminUnreadCount,
  adminGetAttachment,
};
