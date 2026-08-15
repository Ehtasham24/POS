const express = require("express");
const routes = express.Router();
const { Login, Logout, Me } = require("../../Controller/authController");
const requireAuth = require("../../Middleware/requireAuth");

// Login/logout are deliberately public (see requireAuth.js/Middleware comments — nothing
// to authenticate yet at login, and logout must succeed even on an expired session).
// /me is the one route in this router that *does* need requireAuth, applied per-route
// rather than router-wide, since it's the only one of the three that actually needs
// req.user populated.
routes.post("/api/auth/login", Login);
routes.post("/api/auth/logout", Logout);
routes.get("/api/auth/me", requireAuth, Me);

module.exports = routes;
