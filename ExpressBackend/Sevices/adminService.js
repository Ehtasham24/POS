const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { hashPassword, comparePassword } = require("../utils/auth");
const { hasFeature } = require("../config/features");
const { USAGE_TABLES } = require("../config/usageTables");
const { closeOpenShiftsForDowngrade } = require("./shiftService");
const { flattenBatchProducts } = require("./productsService");
const { getEgressByShop } = require("./egressService");
const { getTotalDbCapacityBytes } = require("./platformSettingsService");
const { getActualDatabaseSizeBytes } = require("./dbStatsService");

const VALID_TIERS = ["basic", "smart", "advanced"];

// node-postgres returns NUMERIC columns as strings too (same reasoning as BIGINT — it can't
// assume a value fits a JS number without precision loss), so storage_quota_percent needs
// the same treatment storage_quota_bytes did before migration 025 replaced it: every shop
// row coming straight back from a query goes through this before it reaches a caller, or
// the frontend gets "10" instead of 10 and any strict numeric check on it silently misbehaves.
const normalizeShopRow = (row) =>
  row && {
    ...row,
    storage_quota_percent: row.storage_quota_percent == null ? null : Number(row.storage_quota_percent),
  };

// A superadmin's own password change — there's no "forgot password" flow at this level
// (deliberately: recovering a locked-out platform admin account is a DB-access-required
// operation, same as bootstrapping the first one via scripts/create-superadmin.js), so this
// is the only self-service path. role='superadmin' is checked here too, not just relied on
// via requireSuperAdmin — this function should never silently change a shop-scoped owner/
// cashier's password even if it were ever called with the wrong id.
const changeSuperAdminPassword = async (userId, { currentPassword, newPassword }) => {
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Current and new password are required");
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters");
  }

  const { rows } = await pool.query(
    `SELECT password_hash FROM users WHERE id = $1 AND role = 'superadmin'`,
    [userId]
  );
  if (!rows[0]) throw new ApiError(404, "Account not found");

  // 400, not 401 — utils/api.js's request() treats ANY 401 as "your session itself is
  // invalid" and dispatches the global auth:unauthorized event, which AuthContext reacts to
  // by clearing the logged-in user and bouncing to /login. This is a validation failure on a
  // field in the form (wrong current password), not an expired/invalid session — using 401
  // here would silently log the admin out for nothing more than a typo.
  const matches = await comparePassword(currentPassword, rows[0].password_hash);
  if (!matches) throw new ApiError(400, "Current password is incorrect");

  const newHash = await hashPassword(newPassword);
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, newHash]);
};

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
    `SELECT s.id, s.name, s.slug, s.tier, s.is_active, s.created_at, s.max_users, s.storage_quota_percent,
            (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id AND u.is_active = true) AS user_count
     FROM shops s
     ORDER BY s.created_at DESC`
  );
  return rows.map(normalizeShopRow);
};

// Shared by createShop and updateShopDetails below — a bare integer >= 1, everything else
// (missing, zero, negative, non-numeric, a float) is a validation error rather than a
// silently-coerced guess.
const parseMaxUsers = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, "Max users must be a positive whole number");
  }
  return parsed;
};

// Creates a shop and its first Owner user together, in one transaction — a shop with no
// owner (or an owner row left behind by a failed shop insert) is a state nothing else in
// this app expects and would be awkward to recover from by hand.
const createShop = async ({ name, tier, ownerUsername, ownerPassword, ownerDisplayName, maxUsers }) => {
  if (!name || !name.trim()) throw new ApiError(400, "Shop name is required");
  if (!VALID_TIERS.includes(tier)) throw new ApiError(400, `Unknown tier "${tier}"`);
  if (!ownerUsername || !ownerUsername.trim()) throw new ApiError(400, "Owner username is required");
  if (!ownerPassword || ownerPassword.length < 8) {
    throw new ApiError(400, "Owner password must be at least 8 characters");
  }
  // Matches the column default (migration 023) when the caller doesn't send one at all —
  // the admin form always does, but a direct API call reasonably shouldn't have to.
  const resolvedMaxUsers = maxUsers === undefined ? 5 : parseMaxUsers(maxUsers);

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
      `INSERT INTO shops (name, slug, tier, is_active, max_users)
       VALUES ($1, $2, $3, true, $4)
       RETURNING id, name, slug, tier, is_active, created_at, max_users`,
      [name.trim(), slug, tier, resolvedMaxUsers]
    );
    const shop = normalizeShopRow(shopRows[0]);

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

// null explicitly clears the quota (unlimited); undefined means "leave it alone" — the
// same three-way distinction updateShopDetails already makes for name/maxUsers, just with
// an actual valid "clear it" value this time instead of only "don't touch." A percentage
// of the platform's total DB capacity (platform_settings), not an absolute byte count — see
// migration 025's own comment for why an admin-typed absolute number was the actual bug.
const parseStorageQuotaPercent = (value) => {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    throw new ApiError(400, "Storage quota must be a percentage between 0 and 100");
  }
  return parsed;
};

// Edits a shop's own details (name, seat limit, storage quota) — deliberately separate from
// updateShopTier below: tier changes trigger downgrade automations and are a much bigger
// deal, whereas these are plain field edits with no side effects.
const updateShopDetails = async (shopId, { name, maxUsers, storageQuotaPercent }) => {
  if (name === undefined && maxUsers === undefined && storageQuotaPercent === undefined) {
    throw new ApiError(400, "Nothing to update");
  }
  if (name !== undefined && !name.trim()) {
    throw new ApiError(400, "Shop name is required");
  }

  const updates = [];
  const params = [shopId];
  if (name !== undefined) {
    params.push(name.trim());
    updates.push(`name = $${params.length}`);
  }
  if (maxUsers !== undefined) {
    const parsed = parseMaxUsers(maxUsers);
    // Lowering the limit below the shop's current active headcount would leave it in a
    // state nothing else expects (already over its own limit) — reject it here rather than
    // let it happen and rely on createUser's own check to merely stop it from getting worse.
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users WHERE shop_id = $1 AND is_active = true`,
      [shopId]
    );
    if (parsed < countRows[0].n) {
      throw new ApiError(
        400,
        `Can't set the limit below the ${countRows[0].n} active user(s) this shop already has`
      );
    }
    params.push(parsed);
    updates.push(`max_users = $${params.length}`);
  }
  if (storageQuotaPercent !== undefined) {
    params.push(parseStorageQuotaPercent(storageQuotaPercent));
    updates.push(`storage_quota_percent = $${params.length}`);
  }

  const { rows } = await pool.query(
    `UPDATE shops SET ${updates.join(", ")} WHERE id = $1
     RETURNING id, name, slug, tier, is_active, max_users, storage_quota_percent`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Shop not found");
  return normalizeShopRow(rows[0]);
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
     RETURNING id, name, slug, tier, is_active, max_users, storage_quota_percent`,
    [shopId, newTier]
  );

  return { shop: normalizeShopRow(updated[0]), automations };
};

const setShopActive = async (shopId, isActive) => {
  const { rows } = await pool.query(
    `UPDATE shops SET is_active = $2 WHERE id = $1
     RETURNING id, name, slug, tier, is_active, max_users, storage_quota_percent`,
    [shopId, !!isActive]
  );
  if (!rows[0]) throw new ApiError(404, "Shop not found");
  return normalizeShopRow(rows[0]);
};

// Resource usage per shop — this is one shared database, not per-tenant infrastructure, so
// "how much is shop X using" can only ever mean "how much of THIS database is shop X's
// data." row_count is the honest, simple number; approx_bytes (pg_column_size summed per
// row) is a real measurement of each row's own on-disk footprint, not a guess — it just
// doesn't include index/TOAST overhead, so treat it as a lower bound, not an exact figure.
// One query per table (each already has a shop_id-leading index from migration 021) rather
// than a single UNION ALL — far simpler to read, and this is an admin-only, infrequently-
// loaded page, not a hot path worth optimizing into one round trip.
//
// egressBytes/egressRequests (last 30 days) come from shop_egress_daily — a real measured
// count of response bytes actually sent, not inferred from row sizes the way storage is;
// see egressService.js and Server.js's tracking middleware for where those numbers come from.
//
// storage_quota_bytes here is DERIVED (storage_quota_percent × the platform's total DB
// capacity, fetched once for the whole report, not per shop) — the percentage itself is
// what's actually stored, precisely so it stays meaningful if the platform's total capacity
// ever changes (a plan upgrade rescales every shop's effective quota with it, with nothing
// to update per-shop). See migration 025 / platformSettingsService.js.
const getUsageByShop = async () => {
  const [totalDbCapacityBytes, actualDatabaseSizeBytes] = await Promise.all([
    getTotalDbCapacityBytes(),
    getActualDatabaseSizeBytes(),
  ]);
  const { rows: shops } = await pool.query(
    `SELECT id, name, slug, tier, storage_quota_percent FROM shops ORDER BY id`
  );
  const usageByShopId = new Map(
    shops.map((s) => {
      const normalized = normalizeShopRow(s);
      return [
        s.id,
        {
          ...normalized,
          storage_quota_bytes:
            normalized.storage_quota_percent != null
              ? Math.round((normalized.storage_quota_percent / 100) * totalDbCapacityBytes)
              : null,
          tables: {},
          totalRows: 0,
          approxBytes: 0,
          egressBytes: 0,
          egressRequests: 0,
        },
      ];
    })
  );

  for (const table of USAGE_TABLES) {
    const { rows } = await pool.query(
      `SELECT shop_id, COUNT(*)::int AS row_count, COALESCE(SUM(pg_column_size(t.*)), 0)::bigint AS approx_bytes
       FROM ${table} t
       GROUP BY shop_id`
    );
    for (const row of rows) {
      const entry = usageByShopId.get(row.shop_id);
      if (!entry) continue; // shouldn't happen (shop_id is a FK), but don't let one bad row sink the whole report
      entry.tables[table] = { rowCount: row.row_count, approxBytes: Number(row.approx_bytes) };
      entry.totalRows += row.row_count;
      entry.approxBytes += Number(row.approx_bytes);
    }
  }

  const egressByShop = await getEgressByShop(30);
  for (const row of egressByShop) {
    const entry = usageByShopId.get(row.shopId);
    if (!entry) continue;
    entry.egressBytes = row.bytes;
    entry.egressRequests = row.requestCount;
  }

  // estimatedRealBytes closes the gap between approxBytes (row content only, a lower bound)
  // and actualDatabaseSizeBytes (the real, measured total, indexes/overhead included):
  // Postgres can't attribute a shared table's index to one tenant directly, so this takes
  // each shop's share of all shops' row content and applies that same share to the real
  // total instead. It's an estimate, not exact — but it's what "Quota Used" below is
  // actually computed against, since a shop's quota is meant to track its real footprint,
  // not just the part of it usageTables.js's whitelist can see directly.
  const totalApproxBytes = [...usageByShopId.values()].reduce((sum, e) => sum + e.approxBytes, 0);
  for (const entry of usageByShopId.values()) {
    const shareOfContent = totalApproxBytes > 0 ? entry.approxBytes / totalApproxBytes : 0;
    entry.estimatedRealBytes = Math.round(shareOfContent * actualDatabaseSizeBytes);
  }

  // totalDbCapacityBytes travels alongside the per-shop list (not a separate request the
  // frontend has to make) — every percentage shown on the Usage page, per-shop or "share of
  // total," is only meaningful next to this number. actualDatabaseSizeBytes is the REAL
  // measurement (pg_database_size — see dbStatsService.js) for "how close are we to actually
  // hitting the plan's limit," distinct from the per-shop pg_column_size sums above, which
  // are honest lower bounds only really meaningful for comparing shops to each other.
  return { shops: [...usageByShopId.values()], totalDbCapacityBytes, actualDatabaseSizeBytes };
};

module.exports = {
  VALID_TIERS,
  listShops,
  createShop,
  updateShopDetails,
  updateShopTier,
  setShopActive,
  changeSuperAdminPassword,
  getUsageByShop,
};
