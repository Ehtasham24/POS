const express = require("express");
const routes = express.Router();
const { GetUsers, PostUser, PatchUser } = require("../../Controller/usersController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");
const requireFeature = require("../../Middleware/requireFeature");

// Applied per-route, not via routes.use(...) — a router-level .use(mw) with no path
// fires for *every* request that reaches this router in the app's pipeline, not just
// ones matching this router's own declared paths (confirmed live: it was rejecting
// unrelated requests like GET /categories with "Owner access required" before this fix,
// since usersRoutes happened to be mounted ahead of categoriesRoutes in Server.js).
// requireFeature("multiUser") — a Basic shop only ever has the one owner account it
// signed up with; managing additional staff accounts is Smart-tier+.
routes.get("/api/users", requireAuth, requireOwner, requireFeature("multiUser"), GetUsers);
routes.post("/api/users", requireAuth, requireOwner, requireFeature("multiUser"), PostUser);
routes.patch("/api/users/:id", requireAuth, requireOwner, requireFeature("multiUser"), PatchUser);

module.exports = routes;
