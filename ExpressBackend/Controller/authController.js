const asyncHandler = require("../utils/asyncHandler");
const { login } = require("../Sevices/authService");
const { COOKIE_NAME, COOKIE_OPTIONS } = require("../utils/auth");

const Login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const { token, user } = await login(username, password);
  res.cookie(COOKIE_NAME, token, { ...COOKIE_OPTIONS, secure: req.secure });
  res.send(user);
});

const Logout = asyncHandler(async (req, res) => {
  // Always succeeds — see requireAuth.js's comment on why this route never requires a
  // valid session. Clearing a cookie that doesn't exist / already expired is a no-op.
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS, secure: req.secure });
  res.status(204).send();
});

// req.user is already set by requireAuth (this route does go through it, unlike login/
// logout) — this just echoes it back so the frontend's AuthContext can ask "am I logged
// in, and as who" on app load.
const Me = asyncHandler(async (req, res) => {
  res.send(req.user);
});

module.exports = { Login, Logout, Me };
