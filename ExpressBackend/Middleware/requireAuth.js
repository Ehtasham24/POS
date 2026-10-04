const ApiError = require("../utils/ApiError");
const { verifyToken, COOKIE_NAME } = require("../utils/auth");
const { findUserById } = require("../Sevices/authService");
const { runAsTenant } = require("../Db");

// Mounted per-router (router.use(requireAuth) inside each protected router file — see
// categoriesRoutes.js etc.), NOT globally in Server.js. This app's routers don't share a
// common "/api" path prefix (confirmed: some are "/categories", "/sales", others
// "/api/inventory", "/api/settings"), so there's nothing to gate by pattern alone at the
// server level — and a blanket server.use(requireAuth) would also catch the static
// build/SPA catch-all registered after it, which must stay reachable even when logged
// out (otherwise an unauthenticated visitor couldn't load the app far enough to even see
// the login page). authRoutes.js and healthRoutes.js simply never attach this.
//
// Sets req.user = { id, username, displayName, role, ... } and req.shop = { id, tier } on
// success — req.shop is null for a superadmin (migration 022), who belongs to no shop.
//
// A shop's register reading history from the cloud (Middleware/deviceReadThrough.js) has no
// session cookie: that middleware has already checked the device and says who is signed in on
// it, in req.deviceReadThrough. Everything below then applies to that person as usual.
async function requireAuth(req, res, next) {
  const readThrough = req.deviceReadThrough;
  let userId = readThrough?.userId;
  if (!readThrough) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return next(new ApiError(401, "Not authenticated"));
    try {
      userId = verifyToken(token).id;
    } catch (err) {
      // Covers both an expired token and a tampered/invalid one — same response either
      // way (the frontend's isAuthError handling, see utils/api.js, treats both as
      // "log in again", it doesn't need to distinguish the reason).
      return next(new ApiError(401, "Session expired — please log in again"));
    }
  }

  // Re-checked against the DB on every request rather than trusted straight off the JWT
  // payload — the token only proves *identity* (this really is user #N), not that their
  // permissions are still current. With a 180-day "stay logged in" token (see
  // utils/auth.js), trusting a stale role/active flag would mean deactivating a cashier
  // (e.g. after they leave) wouldn't actually take effect until their token happened to
  // expire, weeks later.
  //
  // Wrapped in try/catch because this function is called directly by Express as
  // middleware (router.use(requireAuth), not asyncHandler(requireAuth) — asyncHandler is
  // only applied to controllers) — an unhandled rejection here (e.g. the DB pooler
  // resetting an in-flight connection, pg-pool's own ECONNRESET) would otherwise crash
  // the entire process instead of just failing this one request. Db.js's pool.on("error")
  // only covers *idle* clients; this covers the same class of transient DB error hitting
  // an *active* query.
  let user;
  try {
    user = await findUserById(userId);
  } catch (err) {
    return next(err instanceof ApiError ? err : new ApiError(503, "Database temporarily unavailable — please try again"));
  }
  if (!user || !user.isActive || (readThrough && user.shopId !== readThrough.shopId)) {
    return next(new ApiError(401, "Account no longer active"));
  }
  // A shop being deactivated (e.g. a cancelled subscription) locks out every one of its
  // users the same request-by-request way a deactivated individual user already does
  // above — same reasoning: re-checked fresh here rather than trusted off anything
  // cached, so it takes effect on the very next request, not whenever a stale value
  // would otherwise expire. Skipped entirely for a superadmin (migration 022) — they
  // belong to no shop at all, so shopIsActive is NULL, not false; `!null` would otherwise
  // incorrectly read as "shop deactivated" and lock every superadmin out permanently.
  if (user.role !== "superadmin" && !user.shopIsActive) {
    return next(new ApiError(401, "Shop is no longer active"));
  }

  req.user = user;
  // Tier is read fresh here every request, never off the JWT payload — the token is
  // long-lived (utils/auth.js's 180-day TTL), so a shop that upgrades/downgrades today
  // would otherwise keep granting/denying features based on whatever tier it was on
  // when each user's token happened to be issued. null for a superadmin (no shop to
  // report) — requireFeature/tier-gated routes are never mounted on any admin route, so
  // nothing downstream ever needs req.shop to be non-null for that role.
  req.shop = user.shopId ? { id: user.shopId, tier: user.shopTier } : null;

  // Everything downstream of here (the route's own handler and every query it makes) runs
  // with the database pinned to this shop — see Db.js. The shop id comes from the DB row
  // just read above, never from anything the client sent. A superadmin has no shop, so
  // their requests run outside any tenant context, same as before.
  if (req.shop) return runAsTenant(req.shop.id, next);
  next();
}

module.exports = requireAuth;
