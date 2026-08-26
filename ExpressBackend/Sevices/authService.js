const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { hashPassword, comparePassword, signToken } = require("../utils/auth");

// Shared by login (by username) and findUserById (by id — the app's single hottest
// query, run on every authenticated request via requireAuth) so both ever build on top
// of exactly one query shape instead of two that quietly drift apart. Joined with shops
// here rather than a separate getShopById call: a user belongs to exactly one shop
// (users.shop_id), so their tier/shop-active status costs nothing extra to fetch
// alongside them in the same round trip. password_hash is only ever read here — never
// forwarded to a caller, since toPublicUser() below doesn't expose it.
const USER_SHOP_QUERY = `
  SELECT u.id, u.username, u.password_hash, u.display_name, u.role, u.is_active, u.shop_id,
         s.tier AS shop_tier, s.is_active AS shop_is_active
  FROM users u
  JOIN shops s ON s.id = u.shop_id
`;

const toPublicUser = (row) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  role: row.role,
  isActive: row.is_active,
  shopId: row.shop_id,
  shopTier: row.shop_tier,
  shopIsActive: row.shop_is_active,
});

const login = async (username, password) => {
  if (!username || !password) throw new ApiError(400, "Username and password are required");

  const { rows } = await pool.query(`${USER_SHOP_QUERY} WHERE u.username = $1`, [username]);
  const user = rows[0];
  // Same message for "no such user" and "wrong password" — distinguishing them lets an
  // attacker enumerate valid usernames.
  if (!user || !user.is_active || !(await comparePassword(password, user.password_hash))) {
    throw new ApiError(401, "Invalid username or password");
  }

  const token = signToken({ id: user.id, role: user.role, displayName: user.display_name });
  return { token, user: toPublicUser(user) };
};

const findUserById = async (id) => {
  const { rows } = await pool.query(`${USER_SHOP_QUERY} WHERE u.id = $1`, [id]);
  return rows[0] ? toPublicUser(rows[0]) : null;
};

module.exports = { login, findUserById, hashPassword };
