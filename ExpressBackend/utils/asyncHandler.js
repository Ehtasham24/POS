// Wraps an async Express handler so any rejected promise is forwarded to next(err)
// instead of needing a try/catch in every controller function.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
