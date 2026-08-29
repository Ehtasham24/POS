// One-off bootstrap for the very first platform admin account (migration 022) — there's no
// UI/API to create a superadmin (deliberately: that would be self-granting platform access
// from inside the platform), so this is the one time it's done directly against the DB.
// After this, every SHOP is created through the admin API (POST /api/admin/shops) instead.
//
// Usage: node scripts/create-superadmin.js <username> <password> [displayName]

const { pool } = require("../Db");
const { hashPassword } = require("../utils/auth");

async function run() {
  const [username, password, displayName] = process.argv.slice(2);
  if (!username || !password) {
    console.error("Usage: node scripts/create-superadmin.js <username> <password> [displayName]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, display_name, role, is_active, shop_id)
       VALUES ($1, $2, $3, 'superadmin', true, NULL)
       RETURNING id, username, display_name`,
      [username, passwordHash, displayName || username]
    );
    console.log("Superadmin created:", rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      console.error(`Username "${username}" is already taken.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
