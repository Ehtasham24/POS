// Error carrying an explicit HTTP status, so the centralized error handler
// can respond with the right code instead of every service/controller guessing.
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = ApiError;
