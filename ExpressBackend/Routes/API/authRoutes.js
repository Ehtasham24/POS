const express = require("express");
const routes = express.Router();
const { Login, Logout, Me, ForgotPassword, SetNewPassword } = require("../../Controller/authController");
const requireAuth = require("../../Middleware/requireAuth");

// Login/logout are deliberately public (see requireAuth.js/Middleware comments — nothing
// to authenticate yet at login, and logout must succeed even on an expired session).
// /me is the one route in this router that *does* need requireAuth, applied per-route
// rather than router-wide, since it's the only one of the three that actually needs
// req.user populated.
routes.post("/api/auth/login", Login);
routes.post("/api/auth/logout", Logout);
routes.get("/api/auth/me", requireAuth, Me);
// Public, same reasoning as login — someone hitting this has no session yet by definition.
routes.post("/api/auth/forgot-password", ForgotPassword);
// The mandatory post-temp-password change — needs a session (one the temp password itself
// just created), but no current-password check (see authService.js's setNewPassword).
routes.patch("/api/auth/set-new-password", requireAuth, SetNewPassword);

module.exports = routes;
