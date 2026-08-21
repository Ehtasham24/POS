const ApiError = require("../utils/ApiError");

// Gates the phone-forwarder webhook routes (Routes/API/paymentNotificationRoutes.js) —
// these are called by the dedicated Android app, not a logged-in staff browser, so there's
// no session cookie to check (requireAuth doesn't apply here). Same shape as this app's
// existing public-but-verified webhook precedent (PayFast's ITN route in Server.js,
// "third-party webhook, deliberately left public" — though that one verifies via a
// signature, this via a single shared secret, appropriately simpler for a phone the owner
// physically controls rather than an arbitrary third party).
//
// NOTIFICATION_FORWARDER_SECRET lives in Development.env, same dotenv convention as
// JWT_SECRET/DATABASE_URL (Db.js/Server.js) — generated once, typed into the phone app's
// settings screen once during setup. Unset entirely (not configured yet) means these
// routes reject everything, rather than silently accepting unauthenticated payment
// confirmations because someone forgot to set it.
function requireForwarderSecret(req, res, next) {
  const expected = process.env.NOTIFICATION_FORWARDER_SECRET;
  if (!expected) {
    return next(new ApiError(503, "Notification forwarder isn't configured on this server yet"));
  }
  const provided = req.get("X-Forwarder-Secret");
  if (!provided || provided !== expected) {
    return next(new ApiError(401, "Invalid forwarder secret"));
  }
  next();
}

module.exports = requireForwarderSecret;
