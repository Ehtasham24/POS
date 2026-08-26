const ApiError = require("../utils/ApiError");
const { hasFeature } = require("../config/features");

// Mounted right alongside requireOwner (after requireAuth, which sets both req.user and
// req.shop) — same shape, same division of responsibility: a flat gate here, any
// conditional/self-vs-owner logic stays in the service layer where it already lives.
const requireFeature = (key) => (req, res, next) => {
  if (!hasFeature(req.shop?.tier, key)) {
    // Deliberately generic — no tier name, no "upgrade to X" pitch. This is a paying
    // customer; the upsell belongs in the app's own UI, not an API error string.
    return next(new ApiError(403, "This feature isn't available on your plan"));
  }
  next();
};

module.exports = requireFeature;
