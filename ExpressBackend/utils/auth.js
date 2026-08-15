const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SALT_ROUNDS = 10;
// "Stay logged in until manual logout" (a deliberate choice — see migrations/006's
// comment and the offline-sync reasoning in requireAuth.js) — a long fixed expiry
// instead of a short one with silent refresh, since there's no session store to refresh
// against anyway (the JWT itself, in an httpOnly cookie, is the only session state).
const TOKEN_TTL = "180d";

const hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });

// Throws (jwt.verify's own error) on an invalid/expired/tampered token — callers decide
// how to translate that into an HTTP response (see requireAuth.js).
const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

const COOKIE_NAME = "pos_session";
// httpOnly: never readable from JS, so an XSS bug can't exfiltrate the session the way
// a localStorage token could.
//
// sameSite "none" (not "lax") — confirmed necessary, not just theoretical: npm start's
// dev workflow serves the frontend at http://localhost:3000 (CRA) and the API at
// https://localhost:4000, and Chrome's *schemeful* same-site check treats those as
// cross-site *purely because the scheme differs* (http vs https), even though the
// hostname is identical — so a Lax cookie is silently never sent/stored on any of these
// cross-origin fetch() calls at all. Confirmed live: login itself succeeded (200, correct
// user in the body) but the browser's cookie jar stayed empty and every subsequent
// request 401'd. "None" requires "Secure" too (browsers reject None cookies that aren't
// also Secure) — satisfied by spreading `{ secure: req.secure }` at each call site,
// which is true here since the backend always answers this specific request over HTTPS
// once mkcert certs are present (Server.js's own condition for entering HTTPS mode at
// all — this repo's established convention, not an edge case). In production, frontend
// and backend are the same origin (Express serves both), where None+Secure works
// identically to Lax — this isn't a same-origin-only regression.
//
// `path: "/"` is NOT optional either — without it, res.cookie() defaults the cookie's
// path to the directory of whatever request set it (RFC 6265), i.e. "/api/auth" here, so
// it would only ever be sent back on requests to /api/auth/* and never reach any other
// route (/categories, /api/inventory, ...).
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "none",
  path: "/",
  maxAge: 180 * 24 * 60 * 60 * 1000, // mirrors TOKEN_TTL
};

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  COOKIE_NAME,
  COOKIE_OPTIONS,
};
