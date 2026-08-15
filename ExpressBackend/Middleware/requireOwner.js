const ApiError = require("../utils/ApiError");

// Always mounted *after* requireAuth on the same route (requireAuth sets req.user) —
// gates the routes only the Owner role should reach at all (Inventory writes, Credit/
// Debit, Contacts, Company/Settings writes, Sales Report). Routes a Cashier is allowed
// to call but only for their own data (e.g. voiding their own same-day sale) do their
// own conditional check in the service layer instead of this flat role gate.
function requireOwner(req, res, next) {
  if (req.user?.role !== "owner") {
    return next(new ApiError(403, "Owner access required"));
  }
  next();
}

module.exports = requireOwner;
