const ApiError = require("../utils/ApiError");
const { runAsTenant } = require("../Db");
const { findShopBySecret } = require("../Sevices/forwarderSecretService");

// Gates the phone-forwarder webhook routes (Routes/API/paymentNotificationRoutes.js) —
// these are called by the dedicated Android app, not a logged-in staff browser, so there's
// no session cookie to check (requireAuth doesn't apply here). Same shape as this app's
// existing public-but-verified webhook precedent (PayFast's ITN route in Server.js,
// "third-party webhook, deliberately left public" — though that one verifies via a
// signature, this via a shared secret, appropriately simpler for a phone the owner
// physically controls rather than an arbitrary third party).
//
// The secret is per shop (Settings -> Payment Notification Forwarder, see
// forwarderSecretService.js), and it's what identifies the shop: req.shop is set from it,
// and everything downstream runs pinned to that shop exactly like a logged-in request does
// (requireAuth.js) — the matcher can only ever see this shop's pending payments.
async function requireForwarderSecret(req, res, next) {
  const provided = req.get("X-Forwarder-Secret");
  if (!provided) return next(new ApiError(401, "Invalid forwarder secret"));

  let shop;
  try {
    shop = await findShopBySecret(provided);
  } catch {
    return next(new ApiError(503, "Database temporarily unavailable — please try again"));
  }
  if (!shop) return next(new ApiError(401, "Invalid forwarder secret"));
  // Same lockout requireAuth applies to a deactivated shop's staff.
  if (!shop.is_active) return next(new ApiError(401, "Shop is no longer active"));

  // req.shop.tier is what the route's requireFeature("bankTransfer") checks next — a
  // downgraded shop keeps its secret but loses the feature.
  req.shop = { id: shop.id, tier: shop.tier };
  return runAsTenant(shop.id, next);
}

module.exports = requireForwarderSecret;
