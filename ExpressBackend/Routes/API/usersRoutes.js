const express = require("express");
const routes = express.Router();
const { GetUsers, PostUser, PatchUser } = require("../../Controller/usersController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");

// Applied per-route, not via routes.use(...) — a router-level .use(mw) with no path
// fires for *every* request that reaches this router in the app's pipeline, not just
// ones matching this router's own declared paths (confirmed live: it was rejecting
// unrelated requests like GET /categories with "Owner access required" before this fix,
// since usersRoutes happened to be mounted ahead of categoriesRoutes in Server.js).
routes.get("/api/users", requireAuth, requireOwner, GetUsers);
routes.post("/api/users", requireAuth, requireOwner, PostUser);
routes.patch("/api/users/:id", requireAuth, requireOwner, PatchUser);

module.exports = routes;
