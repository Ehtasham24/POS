const support = require("../Sevices/supportService");
const asyncHandler = require("../utils/asyncHandler");

// Support tickets (Sevices/supportService.js): the shop's side, then the platform admin's.

const sendPicture = (res, { mime, data }) => {
  res.set({ "Content-Type": mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" });
  res.send(data);
};

// --- Shop ---
const ListTickets = asyncHandler(async (req, res) => {
  res.send(await support.listShopTickets(req.user, { state: req.query.state }));
});
const CreateTicket = asyncHandler(async (req, res) => {
  const { kind, title, body, attachments, context } = req.body || {};
  res.status(201).send(await support.createTicket(req.user, { kind, title, body, attachments, context }));
});
const GetTicket = asyncHandler(async (req, res) => {
  res.send(await support.getShopTicket(req.user, req.params.id));
});
const ReplyToTicket = asyncHandler(async (req, res) => {
  const { body, attachments } = req.body || {};
  res.send(await support.replyAsShop(req.user, req.params.id, { body, attachments }));
});
const GetUnreadCount = asyncHandler(async (req, res) => {
  res.send({ count: await support.shopUnreadCount(req.user) });
});
const GetAttachment = asyncHandler(async (req, res) => {
  sendPicture(res, await support.getShopAttachment(req.user, req.params.id));
});

// --- Platform admin ---
const AdminListTickets = asyncHandler(async (req, res) => {
  const { state, kind, shopId, q, page } = req.query;
  res.send(await support.adminListTickets({ state, kind, shopId, q, page }));
});
const AdminGetTicket = asyncHandler(async (req, res) => {
  res.send(await support.adminGetTicket(req.params.id));
});
const AdminUpdateTicket = asyncHandler(async (req, res) => {
  const { body, attachments, status } = req.body || {};
  res.send(await support.adminUpdateTicket(req.user, req.params.id, { body, attachments, status }));
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
  ReplyToTicket,
  GetUnreadCount,
  GetAttachment,
  AdminListTickets,
  AdminGetTicket,
  AdminUpdateTicket,
  AdminGetUnreadCount,
  AdminGetAttachment,
};
