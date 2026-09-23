// Final Express middleware: catches errors forwarded via next(err) by asyncHandler
// and responds with a single consistent JSON shape instead of each controller
// formatting its own error response.
//
// A Postgres foreign-key violation (23503) that reaches here without a friendlier ApiError
// in front of it gets a plain 400/409 instead of a 500 — and never Postgres's own message,
// which names tables and columns. The same-shop keys (migration 029) make this the
// database's answer to one shop referencing another shop's record, so it has to read as
// "not found", never as a detailed explanation of what exists elsewhere.
const FOREIGN_KEY_VIOLATION = "23503";

const errorHandler = (err, req, res, next) => {
  console.error(err);
  if (err.code === FOREIGN_KEY_VIOLATION) {
    // "Key (...) is still referenced from table ..." = deleting something still in use;
    // anything else = writing a reference to something that doesn't exist (for this shop).
    const stillReferenced = /is still referenced/.test(err.detail || "");
    return res.status(stillReferenced ? 409 : 400).json({
      message: stillReferenced
        ? "This is still in use by other records, so it can't be removed."
        : "Something this refers to wasn't found.",
    });
  }
  res.status(err.status || 500).json({ message: err.message || "Internal server error" });
};

module.exports = errorHandler;
