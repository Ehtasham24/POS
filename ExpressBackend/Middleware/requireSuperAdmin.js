const ApiError = require("../utils/ApiError");

// Same shape as requireOwner — mounted after requireAuth (which sets req.user) on the
// platform admin routes only (Routes/API/adminRoutes.js). A shop's own Owner/Cashier never
// has this role (migration 022 makes it mutually exclusive with having a shop_id at all),
// so this is the one boundary between "runs a shop" and "runs the platform."
function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== "superadmin") {
    return next(new ApiError(403, "Admin access required"));
  }
  next();
}

module.exports = requireSuperAdmin;
