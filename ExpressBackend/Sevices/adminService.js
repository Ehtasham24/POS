const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { hashPassword } = require("../utils/auth");
const { hasFeature } = require("../config/features");
const { closeOpenShiftsForDowngrade } = require("./shiftService");
const { flattenBatchProducts } = require("./productsService");

const VALID_TIERS = ["basic", "smart", "advanced"];

// Deliberately simple — a human-typed shop name turned into a URL/reference-safe slug,
// not a general Unicode slugifier. Uniqueness (the actual constraint, shops.slug UNIQUE)
// is handled by createShop's retry loop below, not by this function.
const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "") || "shop";

const listShops = async () => {
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.slug, s.tier, s.is_active, s.created_at,
            (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id) AS user_count
     FROM shops s
     ORDER BY s.created_at DESC`
  );
  return rows;
};

// Creates a shop and its first Owner user together, in one transaction — a shop with no
// owner (or an owner row left behind by a failed shop insert) is a state nothing else in
// this app expects and would be awkward to recover from by hand.
const createShop = async ({ name, tier, ownerUsername, ownerPassword, ownerDisplayName }) => {
  if (!name || !name.trim()) throw new ApiError(400, "Shop name is required");
  if (!VALID_TIERS.includes(tier)) throw new ApiError(400, `Unknown tier "${tier}"`);
  if (!ownerUsername || !ownerUsername.trim()) throw new ApiError(400, "Owner username is required");
  if (!ownerPassword || ownerPassword.length < 8) {
    throw new ApiError(400, "Owner password must be at least 8 characters");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Retries with a numeric suffix on collision rather than a single query with a
    // computed suffix — two shops sharing a slugified name is rare enough that this loop
    // almost always runs exactly once, and it's far simpler to read than a SQL-side
    // "find the first free suffix" query.
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { rows: existing } = await client.query(`SELECT 1 FROM shops WHERE slug = $1`, [slug]);
      if (existing.length === 0) break;
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const { rows: shopRows } = await client.query(
      `INSERT INTO shops (name, slug, tier, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, name, slug, tier, is_active, created_at`,
      [name.trim(), slug, tier]
    );
    const shop = shopRows[0];

    const passwordHash = await hashPassword(ownerPassword);
    const { rows: userRows } = await client.query(
      `INSERT INTO users (username, password_hash, display_name, role, is_active, shop_id)
       VALUES ($1, $2, $3, 'owner', true, $4)
       RETURNING id, username, display_name`,
      [ownerUsername.trim(), passwordHash, (ownerDisplayName || ownerUsername).trim(), shop.id]
    );

    await client.query("COMMIT");
    return { shop, owner: userRows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      // Only users.username is uniquely constrained among what this inserts — the slug
      // loop above already guarantees shops.slug can't collide.
      throw new ApiError(409, `Username "${ownerUsername}" is already taken`);
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, err.message);
  } finally {
    client.release();
  }
};

// The one place a shop's tier actually changes — and so the one place the Phase 6
// downgrade automations (flattenBatchProducts, closeOpenShiftsForDowngrade) finally get
// called from. Each automation is keyed off the SPECIFIC feature being lost, not "is this
// a downgrade" in general — a shop can lose shifts without losing lotTracking (advanced ->
// smart) or lose both at once (advanced -> basic), and each needs its own check.
//
// The automations run before the tier itself flips: if one of them throws, the shop is
// still on its old tier afterward — a half-migrated shop (new tier, but an open shift or a
// batch-tracked product left stranded) is worse than the tier change simply not having
// happened yet.
const updateShopTier = async (shopId, newTier) => {
  if (!VALID_TIERS.includes(newTier)) throw new ApiError(400, `Unknown tier "${newTier}"`);

  const { rows } = await pool.query(`SELECT tier FROM shops WHERE id = $1`, [shopId]);
  if (!rows[0]) throw new ApiError(404, "Shop not found");
  const oldTier = rows[0].tier;

  const losingShifts = hasFeature(oldTier, "shifts") && !hasFeature(newTier, "shifts");
  const losingLotTracking = hasFeature(oldTier, "lotTracking") && !hasFeature(newTier, "lotTracking");

  const automations = { shiftsClosed: 0, productsFlattened: 0 };
  if (losingShifts) {
    automations.shiftsClosed = await closeOpenShiftsForDowngrade(shopId);
  }
  if (losingLotTracking) {
    const { flattened } = await flattenBatchProducts(shopId);
    automations.productsFlattened = flattened;
  }

  const { rows: updated } = await pool.query(
    `UPDATE shops SET tier = $2 WHERE id = $1
     RETURNING id, name, slug, tier, is_active`,
    [shopId, newTier]
  );

  return { shop: updated[0], automations };
};

const setShopActive = async (shopId, isActive) => {
  const { rows } = await pool.query(
    `UPDATE shops SET is_active = $2 WHERE id = $1
     RETURNING id, name, slug, tier, is_active`,
    [shopId, !!isActive]
  );
  if (!rows[0]) throw new ApiError(404, "Shop not found");
  return rows[0];
};

module.exports = { VALID_TIERS, listShops, createShop, updateShopTier, setShopActive };
