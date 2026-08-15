const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { hashPassword, comparePassword, signToken } = require("../utils/auth");

const toPublicUser = (row) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  role: row.role,
  isActive: row.is_active,
});

const login = async (username, password) => {
  if (!username || !password) throw new ApiError(400, "Username and password are required");

  const { rows } = await pool.query(
    "SELECT id, username, password_hash, display_name, role, is_active FROM users WHERE username = $1",
    [username]
  );
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
  const { rows } = await pool.query(
    "SELECT id, username, display_name, role, is_active FROM users WHERE id = $1",
    [id]
  );
  return rows[0] ? toPublicUser(rows[0]) : null;
};

module.exports = { login, findUserById, hashPassword };
