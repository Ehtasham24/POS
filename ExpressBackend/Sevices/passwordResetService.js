const crypto = require("crypto");
const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { hashPassword } = require("../utils/auth");

// Mirrors bankPaymentService.js's request/approve lifecycle (migration 012) — same
// "user-submitted, admin-reviewed" shape (status column, resolved_by/resolved_at), applied
// here to account recovery instead of a payment. Every reset goes through a human admin —
// there's no SMS/email infrastructure in this app to safely automate identity verification,
// so the admin reviews claimed vs. on-file CNIC/phone and decides.

// Readable temp password: excludes visually-ambiguous characters (0/O, 1/l/I) since this
// gets read aloud or typed off a screen by hand, not copy-pasted from a reset link.
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const TEMP_PASSWORD_LENGTH = 10;
const generateTempPassword = () => {
  const bytes = crypto.randomBytes(TEMP_PASSWORD_LENGTH);
  let out = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
    out += TEMP_PASSWORD_CHARS[bytes[i] % TEMP_PASSWORD_CHARS.length];
  }
  return out;
};

// Public — no auth, this IS the "I can't log in" path. Looks up an active user by
// username; if none matches, silently no-ops rather than throwing, so the caller
// (Controller/authController.js's ForgotPassword) can always return the same neutral
// response regardless of whether the username was real — same anti-enumeration reasoning
// authService.js's login() already documents for "no such user" vs "wrong password".
const createRequest = async ({ username, claimedCnic, claimedPhone }) => {
  if (!username) throw new ApiError(400, "Username is required");
  if (!claimedCnic && !claimedPhone) {
    throw new ApiError(400, "Provide your CNIC or phone number so the admin can verify your identity");
  }

  const { rows } = await pool.query(
    `SELECT id, shop_id FROM users WHERE username = $1 AND is_active = true`,
    [username]
  );
  const user = rows[0];
  if (!user) return; // no such account — caller responds the same as if this succeeded

  try {
    await pool.query(
      `INSERT INTO password_reset_requests (user_id, shop_id, claimed_cnic, claimed_phone)
       VALUES ($1, $2, $3, $4)`,
      [user.id, user.shop_id, claimedCnic || null, claimedPhone || null]
    );
  } catch (err) {
    if (err.code === "23505") {
      // The partial unique index (one pending request per user) caught a duplicate —
      // this one IS worth surfacing distinctly, since it's not an enumeration risk (the
      // requester already knows their own username is real) and "you already asked" is
      // genuinely useful feedback instead of silently doing nothing.
      throw new ApiError(409, "A password reset request for this account is already pending");
    }
    throw err;
  }
};

// Admin-side listing — joins users/shops so the review UI can show claimed vs. on-file
// identity side by side without a second round trip.
const listRequests = async (status) => {
  const params = [];
  let where = "";
  if (status) {
    params.push(status);
    where = `WHERE r.status = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.claimed_cnic, r.claimed_phone, r.requested_at, r.resolved_at, r.notes,
            u.id AS user_id, u.username, u.display_name, u.email, u.phone AS on_file_phone,
            u.cnic AS on_file_cnic, s.id AS shop_id, s.name AS shop_name
     FROM password_reset_requests r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN shops s ON s.id = r.shop_id
     ${where}
     ORDER BY r.requested_at DESC`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    claimedCnic: r.claimed_cnic,
    claimedPhone: r.claimed_phone,
    requestedAt: r.requested_at,
    resolvedAt: r.resolved_at,
    notes: r.notes,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    onFileEmail: r.email,
    onFilePhone: r.on_file_phone,
    onFileCnic: r.on_file_cnic,
    shopId: r.shop_id,
    shopName: r.shop_name,
  }));
};

// Issues a real, working temp password and forces a change on next login. The plaintext
// is returned exactly once here and never stored — only its bcrypt hash lands in the DB,
// same as any other password.
const approveRequest = async (requestId, requestingSuperAdmin) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT * FROM password_reset_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    const request = rows[0];
    if (!request) throw new ApiError(404, "Password reset request not found");
    if (request.status !== "pending") {
      throw new ApiError(409, `This request was already ${request.status}`);
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const { rows: userRows } = await client.query(
      `UPDATE users SET password_hash = $2, must_change_password = true
       WHERE id = $1 RETURNING username, display_name`,
      [request.user_id, passwordHash]
    );
    if (!userRows[0]) throw new ApiError(404, "The account this request belongs to no longer exists");

    await client.query(
      `UPDATE password_reset_requests
       SET status = 'approved', resolved_by = $2, resolved_at = NOW()
       WHERE id = $1`,
      [requestId, requestingSuperAdmin?.id || null]
    );

    await client.query("COMMIT");
    return { tempPassword, username: userRows[0].username, displayName: userRows[0].display_name };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err instanceof ApiError ? err : new ApiError(500, err.message);
  } finally {
    client.release();
  }
};

const rejectRequest = async (requestId, requestingSuperAdmin, notes) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT * FROM password_reset_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    const request = rows[0];
    if (!request) throw new ApiError(404, "Password reset request not found");
    if (request.status !== "pending") {
      throw new ApiError(409, `This request was already ${request.status}`);
    }

    await client.query(
      `UPDATE password_reset_requests
       SET status = 'rejected', resolved_by = $2, resolved_at = NOW(), notes = $3
       WHERE id = $1`,
      [requestId, requestingSuperAdmin?.id || null, notes || null]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err instanceof ApiError ? err : new ApiError(500, err.message);
  } finally {
    client.release();
  }
};

module.exports = { createRequest, listRequests, approveRequest, rejectRequest };
