const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { hashPassword, comparePassword, signToken } = require("../utils/auth");
const { assertLoginAllowed, recordLoginEvent } = require("./loginSecurityService");

// Shared by login (by username) and findUserById (by id — the app's single hottest
// query, run on every authenticated request via requireAuth) so both ever build on top
// of exactly one query shape instead of two that quietly drift apart. Joined with shops
// here rather than a separate getShopById call: a user belongs to exactly one shop
// (users.shop_id), so their tier/shop-active status costs nothing extra to fetch
// alongside them in the same round trip. password_hash is only ever read here — never
// forwarded to a caller, since toPublicUser() below doesn't expose it.
//
// LEFT JOIN, not JOIN — migration 022 (superadmin) is the one row shape with a NULL
// shop_id; an inner join would silently exclude a superadmin row from ever being found by
// findUserById, which would make every one of their requests 401 as "account no longer
// active" instead of the real reason. shop_tier/shop_is_active simply come back NULL for
// that row, which toPublicUser and requireAuth both already handle explicitly.
const USER_SHOP_QUERY = `
  SELECT u.id, u.username, u.password_hash, u.display_name, u.role, u.is_active, u.shop_id,
         u.must_change_password,
         s.tier AS shop_tier, s.is_active AS shop_is_active, s.max_users AS shop_max_users
  FROM users u
  LEFT JOIN shops s ON s.id = u.shop_id
`;

const toPublicUser = (row) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  role: row.role,
  isActive: row.is_active,
  shopId: row.shop_id,
  mustChangePassword: row.must_change_password,
  shopTier: row.shop_tier,
  shopIsActive: row.shop_is_active,
  shopMaxUsers: row.shop_max_users,
});

// `client` ({ ip, userAgent }) is where the attempt came from — recorded in the sign-in
// history and used for the lockout (Sevices/loginSecurityService.js).
const login = async (username, password, client = {}) => {
  if (!username || !password) throw new ApiError(400, "Username and password are required");
  await assertLoginAllowed(username, client);

  const { rows } = await pool.query(`${USER_SHOP_QUERY} WHERE u.username = $1`, [username]);
  const user = rows[0];
  // Same message for "no such user" and "wrong password" — distinguishing them lets an
  // attacker enumerate valid usernames.
  if (!user || !user.is_active || !(await comparePassword(password, user.password_hash))) {
    await recordLoginEvent({ username, userId: user?.id, shopId: user?.shop_id, outcome: "failure", ...client });
    throw new ApiError(401, "Invalid username or password");
  }
  await recordLoginEvent({ username, userId: user.id, shopId: user.shop_id, outcome: "success", ...client });

  const token = signToken({ id: user.id, role: user.role, displayName: user.display_name });
  return { token, user: toPublicUser(user) };
};

const findUserById = async (id) => {
  const { rows } = await pool.query(`${USER_SHOP_QUERY} WHERE u.id = $1`, [id]);
  return rows[0] ? toPublicUser(rows[0]) : null;
};

// Stores a new password and clears must_change_password, so ProtectedRoute (clientSide) stops
// sending the user to the set-new-password page. On a register the new hash arrives through
// the sync feed (users is synced), so offline sign-in takes the new password too.
const storePassword = async (userId, newPassword) => {
  if (!newPassword || newPassword.length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters");
  }
  const passwordHash = await hashPassword(newPassword);
  await pool.query(`UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1`, [userId, passwordHash]);
};

// The "I logged in with a temp password, now pick a real one" step — no current-password
// check, unlike changePassword below, since reaching this endpoint already proves identity via
// requireAuth on the session the temp password itself created. Only while a new password is
// actually required: otherwise any open session (or a register's device token, passing a
// request on as one of its staff) could replace a password without knowing it.
const setNewPassword = async (userId, newPassword) => {
  const { rows } = await pool.query(`SELECT must_change_password FROM users WHERE id = $1`, [userId]);
  if (!rows[0]?.must_change_password) throw new ApiError(400, "No new password is required — use Change password instead");
  await storePassword(userId, newPassword);
};

// Anyone signed in changing their own password (the account menu): the current one first, so
// a session left open on a shared counter can't be used to take the account over.
const changePassword = async (userId, currentPassword, newPassword) => {
  const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  if (!rows[0] || !currentPassword || !(await comparePassword(currentPassword, rows[0].password_hash))) {
    throw new ApiError(400, "Your current password isn't right");
  }
  if (currentPassword === newPassword) throw new ApiError(400, "The new password must be different from the current one");
  await storePassword(userId, newPassword);
};

module.exports = { login, findUserById, hashPassword, setNewPassword, changePassword };
