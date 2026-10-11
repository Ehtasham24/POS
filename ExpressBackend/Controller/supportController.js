const support = require("../Sevices/supportService");
const asyncHandler = require("../utils/asyncHandler");

// Support tickets (Sevices/supportService.js): the shop's side, then the platform admin's.
// A register's own report (sync state, its server errors) is taken only when the ticket really
// came through a register (Middleware/deviceReadThrough.js set req.deviceReadThrough).

const sendPicture = (res, { mime, data }) => {
  res.set({ "Content-Type": mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" });
  res.send(data);
};

// --- Shop ---
const ListTickets = asyncHandler(async (req, res) => {
  res.send(await support.listShopTickets(req.user, { state: req.query.state }));
});
const CreateTicket = asyncHandler(async (req, res) => {
  const { kind, title, body, attachments, context, diagnostics, deviceReport } = req.body || {};
  res.status(201).send(
    await support.createTicket(req.user, {
      kind,
      title,
      body,
      attachments,
      context,
      diagnostics,
      deviceReport: req.deviceReadThrough ? deviceReport : undefined,
    })
  );
});
const GetTicket = asyncHandler(async (req, res) => {
  res.send(await support.getShopTicket(req.user, req.params.id));
});
const GetUnreadCount = asyncHandler(async (req, res) => {
  res.send({ count: await support.shopUnreadCount(req.user) });
});
const GetAttachment = asyncHandler(async (req, res) => {
  sendPicture(res, await support.getShopAttachment(req.user, req.params.id));
});

// --- Platform admin ---
const AdminListTickets = asyncHandler(async (req, res) => {
  const { state, kind, priority, shopId, q, page, hideDuplicates } = req.query;
  res.send(await support.adminListTickets({ state, kind, priority, shopId, q, page, hideDuplicates: hideDuplicates === "1" }));
});
const AdminGetTicket = asyncHandler(async (req, res) => {
  res.send(await support.adminGetTicket(req.params.id));
});
const AdminSetStatus = asyncHandler(async (req, res) => {
  res.send(await support.adminSetStatus(req.user, req.params.id, { status: req.body?.status }));
});
const AdminUpdateTicket = asyncHandler(async (req, res) => {
  // Only the fields sent are changed (duplicateOf: null unlinks, so "sent" ≠ "truthy").
  const body = req.body || {};
  const changes = Object.fromEntries(["priority", "adminNote", "duplicateOf"].filter((key) => key in body).map((key) => [key, body[key]]));
  res.send(await support.adminUpdateTicket(req.user, req.params.id, changes));
});
const AdminGetUnreadCount = asyncHandler(async (req, res) => {
  res.send({ count: await support.adminUnreadCount() });
});
const AdminGetAttachment = asyncHandler(async (req, res) => {
  sendPicture(res, await support.adminGetAttachment(req.params.id));
});

module.exports = {
  ListTickets,
  CreateTicket,
  GetTicket,
  GetUnreadCount,
  GetAttachment,
  AdminListTickets,
  AdminGetTicket,
  AdminSetStatus,
  AdminUpdateTicket,
  AdminGetUnreadCount,
  AdminGetAttachment,
};
