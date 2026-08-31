const asyncHandler = require("../utils/asyncHandler");
const { login, setNewPassword } = require("../Sevices/authService");
const { createRequest } = require("../Sevices/passwordResetService");
const { COOKIE_NAME, COOKIE_OPTIONS } = require("../utils/auth");
const { getFeaturesForTier } = require("../config/features");

// Reshapes the flat user object authService.js returns (…, shopId, shopTier, shopIsActive)
// into what the frontend actually consumes — a nested shop.tier/shop.features rather than
// loose top-level fields. features is computed here, once, server-side — the frontend only
// ever reads this list, never derives it from a tier itself (that would mean two copies of
// the feature registry that could quietly drift apart). Shared by Login and Me so the user
// object set right after logging in and the one a page refresh re-fetches from Me are
// always identical in shape.
//
// shop is null for a superadmin (migration 022) — they belong to no shop at all, so there's
// no tier to compute features for. The frontend's useFeature()/ProtectedRoute already treat
// a missing shop as "no features," which is exactly correct for this role: an admin console
// user was never meant to see any shop-gated feature.
const withShopInfo = (user) => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  isActive: user.isActive,
  mustChangePassword: user.mustChangePassword,
  shop: user.shopId
    ? { tier: user.shopTier, features: getFeaturesForTier(user.shopTier), maxUsers: user.shopMaxUsers }
    : null,
});

const Login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const { token, user } = await login(username, password);
  res.cookie(COOKIE_NAME, token, { ...COOKIE_OPTIONS, secure: req.secure });
  res.send(withShopInfo(user));
});

const Logout = asyncHandler(async (req, res) => {
  // Always succeeds — see requireAuth.js's comment on why this route never requires a
  // valid session. Clearing a cookie that doesn't exist / already expired is a no-op.
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS, secure: req.secure });
  res.status(204).send();
});

// req.user is already set by requireAuth (this route does go through it, unlike login/
// logout) — reshaped the same way Login's response is, so the frontend's AuthContext
// always sees one consistent user shape regardless of which of the two populated it.
const Me = asyncHandler(async (req, res) => {
  res.send(withShopInfo(req.user));
});

// Public — this IS the "I can't log in" path, so it can't require a session. Always
// responds with the same neutral message regardless of whether the username matched
// anything, mirroring login()'s own "same error either way" anti-enumeration comment —
// a real match still submits a request behind the scenes (passwordResetService.js).
const ForgotPassword = asyncHandler(async (req, res) => {
  const { username, claimedCnic, claimedPhone } = req.body;
  await createRequest({ username, claimedCnic, claimedPhone });
  res.send({ message: "If we found a matching account, your request has been submitted to the platform admin." });
});

// requireAuth-gated, not public — reaching here already means the caller has a valid
// session (typically one just created by logging in with an admin-issued temp password).
const SetNewPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  await setNewPassword(req.user.id, newPassword);
  res.status(204).send();
});

module.exports = { Login, Logout, Me, ForgotPassword, SetNewPassword };
