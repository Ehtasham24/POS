// Final Express middleware: catches errors forwarded via next(err) by asyncHandler
// and responds with a single consistent JSON shape instead of each controller
// formatting its own error response.
const errorHandler = (err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Internal server error" });
};

module.exports = errorHandler;
