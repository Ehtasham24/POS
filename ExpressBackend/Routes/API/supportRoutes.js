const express = require("express");
const routes = express.Router();
const {
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
} = require("../../Controller/supportController");
const requireAuth = require("../../Middleware/requireAuth");
const requireSuperAdmin = require("../../Middleware/requireSuperAdmin");
const ApiError = require("../../utils/ApiError");

// Support tickets. The shop's routes are for any staff member of a shop (the service decides
// what each one sees: a cashier their own tickets, the owner all of the shop's); a platform
// admin, who belongs to no shop, uses the /api/admin/support ones instead.
const requireShopUser = (req, res, next) => (req.shop ? next() : next(new ApiError(403, "Shop staff only")));

routes.get("/api/support/tickets", requireAuth, requireShopUser, ListTickets);
routes.post("/api/support/tickets", requireAuth, requireShopUser, CreateTicket);
routes.get("/api/support/tickets/:id", requireAuth, requireShopUser, GetTicket);
routes.get("/api/support/unread", requireAuth, requireShopUser, GetUnreadCount);
routes.get("/api/support/attachments/:id", requireAuth, requireShopUser, GetAttachment);

routes.get("/api/admin/support/tickets", requireAuth, requireSuperAdmin, AdminListTickets);
routes.get("/api/admin/support/tickets/:id", requireAuth, requireSuperAdmin, AdminGetTicket);
routes.patch("/api/admin/support/tickets/:id", requireAuth, requireSuperAdmin, AdminUpdateTicket);
routes.patch("/api/admin/support/tickets/:id/status", requireAuth, requireSuperAdmin, AdminSetStatus);
routes.get("/api/admin/support/unread", requireAuth, requireSuperAdmin, AdminGetUnreadCount);
routes.get("/api/admin/support/attachments/:id", requireAuth, requireSuperAdmin, AdminGetAttachment);

module.exports = routes;
