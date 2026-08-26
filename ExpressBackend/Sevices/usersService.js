const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { hashPassword } = require("../utils/auth");

const toPublicUser = (row) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  role: row.role,
  isActive: row.is_active,
  createdAt: row.created_at,
});

const listUsers = async (shopId) => {
  const { rows } = await pool.query(
    "SELECT id, username, display_name, role, is_active, created_at FROM users WHERE shop_id = $1 ORDER BY created_at",
    [shopId]
  );
  return rows.map(toPublicUser);
};

// username stays checked GLOBALLY, not per-shop — migration 021 deliberately left
// users.username as a single database-wide UNIQUE constraint (a shop's owner logs in with
// no shop selection at all, so the username alone has to resolve to exactly one shop; see
// that migration's own comment). The new user itself is still created inside shopId, same
// as everything else here.
const createUser = async ({ username, password, displayName, role }, shopId) => {
  if (!username || !password || !displayName) {
    throw new ApiError(400, "Username, password and display name are required");
  }
  if (!["owner", "cashier"].includes(role)) {
    throw new ApiError(400, "Role must be 'owner' or 'cashier'");
  }
  if (password.length < 6) throw new ApiError(400, "Password must be at least 6 characters");

  const existing = await pool.query("SELECT 1 FROM users WHERE username = $1", [username]);
  if (existing.rows.length) throw new ApiError(409, "That username is already taken");

  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, display_name, role, shop_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, display_name, role, is_active, created_at`,
    [username, passwordHash, displayName, role, shopId]
  );
  return toPublicUser(rows[0]);
};

// Deliberately no hard delete — deactivating is enough (and keeps sales.sold_by /
// sales.voided_by referencing a real row, consistent with never destroying history).
// shop_id checked alongside id throughout — an Owner can only ever look up/edit their own
// shop's users, so a guessed/enumerated id from another shop resolves to "not found" here,
// the same way it already does for every other per-shop resource.
const updateUser = async (id, { displayName, role, isActive, password }, shopId) => {
  const existing = await pool.query("SELECT * FROM users WHERE id = $1 AND shop_id = $2", [id, shopId]);
  if (!existing.rows[0]) throw new ApiError(404, "User not found");

  if (role !== undefined && !["owner", "cashier"].includes(role)) {
    throw new ApiError(400, "Role must be 'owner' or 'cashier'");
  }
  if (password !== undefined && password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  const current = existing.rows[0];
  const passwordHash = password !== undefined ? await hashPassword(password) : current.password_hash;

  const { rows } = await pool.query(
    `UPDATE users
     SET display_name = $2, role = $3, is_active = $4, password_hash = $5
     WHERE id = $1 AND shop_id = $6
     RETURNING id, username, display_name, role, is_active, created_at`,
    [
      id,
      displayName ?? current.display_name,
      role ?? current.role,
      isActive ?? current.is_active,
      passwordHash,
      shopId,
    ]
  );
  return toPublicUser(rows[0]);
};

module.exports = { listUsers, createUser, updateUser };
