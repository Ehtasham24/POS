const crypto = require("crypto");
const { pool, systemPool } = require("../Db");

// Each shop's phone notification forwarder (PaymentNotificationForwarder/) authenticates with
// its OWN secret, and the secret is what identifies the shop — so an incoming bank SMS can
// only ever be matched against that shop's own pending payments. (It used to be one
// server-wide secret in Development.env, with every notification matched against every
// shop's pending payments by amount — shop A's Rs.5000 SMS could confirm shop B's Rs.5000
// sale.)
//
// Only a SHA-256 of the secret is stored. A plain hash (not bcrypt) is right here: the secret
// is 192 random bits, not a human password, so there's nothing to brute-force — and it has
// to be looked up BY its hash on every webhook call, which a salted hash can't do.
const hashSecret = (secret) => crypto.createHash("sha256").update(String(secret)).digest("hex");

// Returns the plaintext once — it's never stored or retrievable again; regenerating is the
// only way to get a new one, and it immediately invalidates the old one.
const generateForShop = async (shopId) => {
  const secret = crypto.randomBytes(24).toString("base64url");
  const { rows } = await pool.query(
    `UPDATE shops SET forwarder_secret_hash = $2, forwarder_secret_created_at = NOW()
     WHERE id = $1 RETURNING forwarder_secret_created_at`,
    [shopId, hashSecret(secret)]
  );
  return { secret, configured: true, createdAt: rows[0].forwarder_secret_created_at };
};

const getStatusForShop = async (shopId) => {
  const { rows } = await pool.query(`SELECT forwarder_secret_created_at FROM shops WHERE id = $1`, [shopId]);
  const createdAt = rows[0]?.forwarder_secret_created_at || null;
  return { configured: !!createdAt, createdAt };
};

// Runs before any shop is known — the secret is what tells us which shop this is — so it
// has to look across every shop, via systemPool (see Db.js).
const findShopBySecret = async (secret) => {
  if (!secret) return null;
  const { rows } = await systemPool.query(
    `SELECT id, tier, is_active FROM shops WHERE forwarder_secret_hash = $1`,
    [hashSecret(secret)]
  );
  return rows[0] || null;
};

module.exports = { generateForShop, getStatusForShop, findShopBySecret };
