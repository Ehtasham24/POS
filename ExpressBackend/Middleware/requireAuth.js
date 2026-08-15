const ApiError = require("../utils/ApiError");
const { verifyToken, COOKIE_NAME } = require("../utils/auth");
const { findUserById } = require("../Sevices/authService");

// Mounted per-router (router.use(requireAuth) inside each protected router file — see
// categoriesRoutes.js etc.), NOT globally in Server.js. This app's routers don't share a
// common "/api" path prefix (confirmed: some are "/categories", "/sales", others
// "/api/inventory", "/api/settings"), so there's nothing to gate by pattern alone at the
// server level — and a blanket server.use(requireAuth) would also catch the static
// build/SPA catch-all registered after it, which must stay reachable even when logged
// out (otherwise an unauthenticated visitor couldn't load the app far enough to even see
// the login page). authRoutes.js and healthRoutes.js simply never attach this.
//
// Sets req.user = { id, username, displayName, role } on success.
async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(new ApiError(401, "Not authenticated"));

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    // Covers both an expired token and a tampered/invalid one — same response either
    // way (the frontend's isAuthError handling, see utils/api.js, treats both as
    // "log in again", it doesn't need to distinguish the reason).
    return next(new ApiError(401, "Session expired — please log in again"));
  }

  // Re-checked against the DB on every request rather than trusted straight off the JWT
  // payload — the token only proves *identity* (this really is user #N), not that their
  // permissions are still current. With a 180-day "stay logged in" token (see
  // utils/auth.js), trusting a stale role/active flag would mean deactivating a cashier
  // (e.g. after they leave) wouldn't actually take effect until their token happened to
  // expire, weeks later.
  const user = await findUserById(decoded.id);
  if (!user || !user.isActive) {
    return next(new ApiError(401, "Account no longer active"));
  }
  req.user = user;
  next();
}

module.exports = requireAuth;
