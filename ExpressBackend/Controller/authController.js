const asyncHandler = require("../utils/asyncHandler");
const { login } = require("../Sevices/authService");
const { COOKIE_NAME, COOKIE_OPTIONS } = require("../utils/auth");
const { getFeaturesForTier } = require("../config/features");

// Reshapes the flat user object authService.js returns (…, shopId, shopTier, shopIsActive)
// into what the frontend actually consumes — a nested shop.tier/shop.features rather than
// loose top-level fields. features is computed here, once, server-side — the frontend only
// ever reads this list, never derives it from a tier itself (that would mean two copies of
// the feature registry that could quietly drift apart). Shared by Login and Me so the user
// object set right after logging in and the one a page refresh re-fetches from Me are
// always identical in shape.
const withShopInfo = (user) => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  isActive: user.isActive,
  shop: {
    tier: user.shopTier,
    features: getFeaturesForTier(user.shopTier),
  },
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

module.exports = { Login, Logout, Me };
