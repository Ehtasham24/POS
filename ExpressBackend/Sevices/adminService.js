const { pool, poolStats } = require("../Db");
const ApiError = require("../utils/ApiError");
const { hashPassword, comparePassword } = require("../utils/auth");
const { hasFeature, TIER_RANK } = require("../config/features");
const { USAGE_TABLES } = require("../config/usageTables");
const { closeOpenShiftsForDowngrade } = require("./shiftService");
const { flattenBatchProducts } = require("./productsService");
const { getEgressByShop } = require("./egressService");
const { getTotalDbCapacityBytes } = require("./platformSettingsService");
const { getActualDatabaseSizeBytes } = require("./dbStatsService");
const { DEFAULT_TIMEZONE, getBusinessTimezone } = require("./settingsService");
const { DUE_ON_SQL, subscriptionStatus, listPayments } = require("./subscriptionService");
const { issueTempPassword } = require("./passwordResetService");
const { listLoginEvents, loginSecuritySummary } = require("./loginSecurityService");
const { listAudit } = require("./auditService");
const monitoring = require("./monitoringService");
const { listDevices, devicesNeedingAttention } = require("./deviceService");

const VALID_TIERS = Object.keys(TIER_RANK);

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

// Per shop: when it last sold something and when anyone last signed in — how the admin
// spots a shop that has quietly stopped using the system.
const SHOP_ACTIVITY_SQL = `
  (SELECT MAX(sa.sale_time) FROM sales sa WHERE sa.shop_id = s.id) AS last_sale_at,
  (SELECT MAX(e.created_at) FROM login_events e WHERE e.shop_id = s.id AND e.outcome = 'success') AS last_login_at`;

const isOnline = (shopId) => {
  const seen = monitoring.shopLastSeenAt(shopId);
  return !!seen && Date.now() - seen.getTime() < monitoring.ONLINE_WINDOW_MS;
};

const listShops = async () => {
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.slug, s.tier, s.is_active, s.created_at, s.max_users, s.max_devices, s.storage_quota_percent,
            (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id AND u.is_active = true) AS user_count,
            (SELECT COUNT(*)::int FROM devices d WHERE d.shop_id = s.id AND d.status = 'active') AS device_count,
            ${DUE_ON_SQL} AS due_on, ${SHOP_ACTIVITY_SQL}
     FROM shops s
     ORDER BY s.created_at DESC`
  );
  return rows.map((row) => ({
    ...normalizeShopRow(row),
    subscription: subscriptionStatus(row.due_on),
    onlineNow: isOnline(row.id),
  }));
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

// How many registers (devices running the POS offline) a shop may have — 0 is allowed: a shop
// that only uses the web app.
const parseMaxDevices = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ApiError(400, "Max devices must be a whole number, 0 or more");
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
const updateShopDetails = async (shopId, { name, maxUsers, maxDevices, storageQuotaPercent }) => {
  if (name === undefined && maxUsers === undefined && maxDevices === undefined && storageQuotaPercent === undefined) {
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
  if (maxDevices !== undefined) {
    const parsed = parseMaxDevices(maxDevices);
    // Same rule as max_users: not below the devices already registered and active (retire
    // or block one first, from the shop's Devices list).
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM devices WHERE shop_id = $1 AND status = 'active'`,
      [shopId]
    );
    if (parsed < countRows[0].n) {
      throw new ApiError(400, `Can't set the limit below the ${countRows[0].n} active device(s) this shop already has`);
    }
    params.push(parsed);
    updates.push(`max_devices = $${params.length}`);
  }
  if (storageQuotaPercent !== undefined) {
    params.push(parseStorageQuotaPercent(storageQuotaPercent));
    updates.push(`storage_quota_percent = $${params.length}`);
  }

  const { rows } = await pool.query(
    `UPDATE shops SET ${updates.join(", ")} WHERE id = $1
     RETURNING id, name, slug, tier, is_active, max_users, max_devices, storage_quota_percent`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Shop not found");
  return normalizeShopRow(rows[0]);
};

// Owner Profile — deliberately separate from updateShopDetails above: this edits a ROW ON
// `users`, not `shops`. One owner per shop, per how createShop provisions it (INSERT ...
// role='owner' exactly once); LIMIT 1 ORDER BY created_at is just a defensive tie-breaker,
// not an expected real scenario. username/password are intentionally NOT editable here —
// username changes ripple into login globally, and password changes go through the
// forgot-password request flow (passwordResetService.js) instead.
const getShopOwner = async (shopId) => {
  const { rows } = await pool.query(
    `SELECT id, username, display_name, email, phone, cnic
     FROM users WHERE shop_id = $1 AND role = 'owner' AND is_active = true
     ORDER BY created_at LIMIT 1`,
    [shopId]
  );
  if (!rows[0]) throw new ApiError(404, "No owner found for this shop");
  const row = rows[0];
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    cnic: row.cnic,
  };
};

const updateShopOwner = async (shopId, { displayName, email, phone, cnic }) => {
  if (displayName === undefined && email === undefined && phone === undefined && cnic === undefined) {
    throw new ApiError(400, "Nothing to update");
  }
  if (displayName !== undefined && !displayName.trim()) {
    throw new ApiError(400, "Owner's display name is required");
  }

  const updates = [];
  const params = [shopId];
  if (displayName !== undefined) {
    params.push(displayName.trim());
    updates.push(`display_name = $${params.length}`);
  }
  if (email !== undefined) {
    params.push(email || null);
    updates.push(`email = $${params.length}`);
  }
  if (phone !== undefined) {
    params.push(phone || null);
    updates.push(`phone = $${params.length}`);
  }
  if (cnic !== undefined) {
    params.push(cnic || null);
    updates.push(`cnic = $${params.length}`);
  }

  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(", ")}
       WHERE shop_id = $1 AND role = 'owner' AND is_active = true
       RETURNING id, username, display_name, email, phone, cnic`,
      params
    );
    if (!rows[0]) throw new ApiError(404, "No owner found for this shop");
    const row = rows[0];
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      phone: row.phone,
      cnic: row.cnic,
    };
  } catch (err) {
    if (err.code === "23505") {
      // idx_users_cnic (migration 026) — a real, nationally-unique government ID, so a
      // collision here means the CNIC was mistyped or already belongs to a different owner.
      throw new ApiError(409, "This CNIC is already on file for a different account");
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, err.message);
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
     RETURNING id, name, slug, tier, is_active, max_users, max_devices, storage_quota_percent`,
    [shopId, newTier]
  );

  return { shop: normalizeShopRow(updated[0]), automations, previousTier: oldTier };
};

const setShopActive = async (shopId, isActive) => {
  const { rows } = await pool.query(
    `UPDATE shops SET is_active = $2 WHERE id = $1
     RETURNING id, name, slug, tier, is_active, max_users, max_devices, storage_quota_percent`,
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

// Days without a sale before an active shop is flagged as having gone quiet.
const DORMANT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// The admin console's landing page: the whole platform at a glance, and the short list of
// things that need the admin's attention (billing, shops gone quiet, sign-in attacks,
// server errors, storage). Sales days are on the platform's own clock (DEFAULT_TIMEZONE).
const getPlatformOverview = async () => {
  const tz = DEFAULT_TIMEZONE;
  const [shopRows, userRows, daily, topShops, pendingResets, dbSize, dbCapacity, logins] = await Promise.all([
    pool.query(
      `SELECT s.id, s.name, s.tier, s.is_active, s.created_at, ${DUE_ON_SQL} AS due_on, ${SHOP_ACTIVITY_SQL}
       FROM shops s`
    ),
    pool.query(`SELECT role, COUNT(*)::int AS n FROM users WHERE is_active AND role <> 'superadmin' GROUP BY role`),
    pool.query(
      `WITH days AS (
         SELECT generate_series(date_trunc('day', NOW() AT TIME ZONE $1) - INTERVAL '29 days',
                                date_trunc('day', NOW() AT TIME ZONE $1), INTERVAL '1 day') AS day
       ),
       money AS (
         SELECT date_trunc('day', (event_time AT TIME ZONE 'UTC') AT TIME ZONE $1) AS day,
                SUM(quantity * selling_price)::bigint AS revenue
         FROM sales_ledger WHERE event_time > NOW() - INTERVAL '31 days' GROUP BY 1
       ),
       receipts AS (
         SELECT date_trunc('day', (created_at AT TIME ZONE 'UTC') AT TIME ZONE $1) AS day, COUNT(*)::int AS transactions
         FROM sale_transactions WHERE created_at > NOW() - INTERVAL '31 days' GROUP BY 1
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(m.revenue, 0)::bigint AS revenue,
              COALESCE(r.transactions, 0) AS transactions
       FROM days d LEFT JOIN money m ON m.day = d.day LEFT JOIN receipts r ON r.day = d.day
       ORDER BY d.day`,
      [tz]
    ),
    pool.query(
      `SELECT s.id, s.name, s.tier, SUM(l.quantity * l.selling_price)::bigint AS revenue
       FROM sales_ledger l JOIN shops s ON s.id = l.shop_id
       WHERE l.event_time > NOW() - INTERVAL '30 days'
       GROUP BY s.id ORDER BY revenue DESC LIMIT 5`
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM password_reset_requests WHERE status = 'pending'`),
    getActualDatabaseSizeBytes(),
    getTotalDbCapacityBytes(),
    loginSecuritySummary(),
  ]);

  const shops = shopRows.rows;
  const byTier = Object.fromEntries(VALID_TIERS.map((tier) => [tier, 0]));
  for (const shop of shops) byTier[shop.tier] = (byTier[shop.tier] || 0) + 1;
  const dailyRows = daily.rows.map((r) => ({ day: r.day, revenue: Number(r.revenue), transactions: r.transactions }));
  const totals = (rows) => ({
    revenue: rows.reduce((sum, r) => sum + r.revenue, 0),
    transactions: rows.reduce((sum, r) => sum + r.transactions, 0),
  });

  const attention = [];
  const flag = (severity, kind, message, shop) =>
    attention.push({ severity, kind, message, shopId: shop?.id ?? null, shopName: shop?.name ?? null });
  const dormantCutoff = Date.now() - DORMANT_DAYS * DAY_MS;
  for (const shop of shops.filter((s) => s.is_active)) {
    const billing = subscriptionStatus(shop.due_on);
    if (billing.status === "overdue") flag("critical", "billing", `Payment overdue by ${-billing.daysLeft} day(s)`, shop);
    if (billing.status === "due_soon") {
      flag("warning", "billing", billing.daysLeft === 0 ? "Payment due today" : `Payment due in ${billing.daysLeft} day(s)`, shop);
    }
    const lastSale = shop.last_sale_at ? new Date(shop.last_sale_at).getTime() : null;
    if (new Date(shop.created_at).getTime() < dormantCutoff && (!lastSale || lastSale < dormantCutoff)) {
      flag(
        "warning",
        "dormant",
        lastSale ? `No sales for ${Math.floor((Date.now() - lastSale) / DAY_MS)} days` : "Has never made a sale",
        shop
      );
    }
  }
  const resets = pendingResets.rows[0].n;
  if (resets > 0) flag("warning", "password_reset", `${resets} password reset request(s) waiting for review`);
  const locked = logins.topUsernames.filter((u) => u.lockedNow).map((u) => u.username);
  if (locked.length) flag("critical", "security", `Locked after repeated wrong passwords: ${locked.join(", ")}`);
  const serverErrors = monitoring.snapshot().lastHour.serverErrors;
  if (serverErrors > 0) flag("critical", "errors", `${serverErrors} server error(s) in the last hour`);
  const dbPercent = dbCapacity ? (dbSize / dbCapacity) * 100 : 0;
  if (dbPercent >= 75) flag(dbPercent >= 90 ? "critical" : "warning", "storage", `Database is ${Math.round(dbPercent)}% full`);
  attention.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));

  return {
    shops: {
      total: shops.length,
      active: shops.filter((s) => s.is_active).length,
      newLast30Days: shops.filter((s) => new Date(s.created_at).getTime() > Date.now() - 30 * DAY_MS).length,
      byTier,
      onlineNow: monitoring.onlineShopIds().length,
    },
    users: Object.fromEntries(userRows.rows.map((r) => [r.role, r.n])),
    sales: {
      today: dailyRows[dailyRows.length - 1],
      last7Days: totals(dailyRows.slice(-7)),
      last30Days: totals(dailyRows),
      daily: dailyRows,
    },
    topShops: topShops.rows.map((r) => ({ ...r, revenue: Number(r.revenue) })),
    database: { sizeBytes: dbSize, capacityBytes: dbCapacity },
    attention,
  };
};

// Everything the admin needs about one shop on one screen: its users (with last sign-in),
// recent trading, billing, sign-in history and the admin changes made to it.
const getShopDetail = async (shopId) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.slug, s.tier, s.is_active, s.created_at, s.max_users, s.max_devices, s.storage_quota_percent,
            (SELECT COUNT(*)::int FROM devices d WHERE d.shop_id = s.id AND d.status = 'active') AS device_count,
            ${DUE_ON_SQL} AS due_on, ${SHOP_ACTIVITY_SQL}
     FROM shops s WHERE s.id = $1`,
    [shopId]
  );
  if (!rows[0]) throw new ApiError(404, "Shop not found");
  const shop = rows[0];
  const tz = await getBusinessTimezone(shopId);

  const [users, trading, counts, payments, logins, audit, devices] = await Promise.all([
    pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, u.is_active, u.created_at,
              (SELECT MAX(e.created_at) FROM login_events e WHERE e.user_id = u.id AND e.outcome = 'success') AS last_login_at
       FROM users u WHERE u.shop_id = $1
       ORDER BY u.is_active DESC, CASE u.role WHEN 'owner' THEN 0 ELSE 1 END, u.display_name`,
      [shopId]
    ),
    // "Today" on the shop's own clock; money from sales_ledger (refunds net off), receipts
    // counted once each from sale_transactions.
    pool.query(
      `WITH money AS (
         SELECT
           COALESCE(SUM(quantity * selling_price) FILTER (
             WHERE (event_time AT TIME ZONE 'UTC') AT TIME ZONE $2 >= date_trunc('day', NOW() AT TIME ZONE $2)), 0)::bigint AS today,
           COALESCE(SUM(quantity * selling_price) FILTER (WHERE event_time > NOW() - INTERVAL '7 days'), 0)::bigint AS last7,
           COALESCE(SUM(quantity * selling_price), 0)::bigint AS last30
         FROM sales_ledger WHERE shop_id = $1 AND event_time > NOW() - INTERVAL '30 days'
       ),
       receipts AS (
         SELECT
           COUNT(*) FILTER (
             WHERE (created_at AT TIME ZONE 'UTC') AT TIME ZONE $2 >= date_trunc('day', NOW() AT TIME ZONE $2))::int AS today,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS last7,
           COUNT(*)::int AS last30
         FROM sale_transactions WHERE shop_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       )
       SELECT money.today AS revenue_today, money.last7 AS revenue_7d, money.last30 AS revenue_30d,
              receipts.today AS receipts_today, receipts.last7 AS receipts_7d, receipts.last30 AS receipts_30d
       FROM money, receipts`,
      [shopId, tz]
    ),
    pool.query(
      `SELECT (SELECT COUNT(*) FROM products WHERE shop_id = $1)::int AS products,
              (SELECT COUNT(*) FROM shifts WHERE shop_id = $1 AND status = 'open')::int AS open_shifts`,
      [shopId]
    ),
    listPayments(shopId),
    listLoginEvents({ shopId, pageSize: 15 }),
    listAudit({ shopId, pageSize: 15 }),
    listDevices(shopId),
  ]);

  const t = trading.rows[0];
  return {
    shop: {
      ...normalizeShopRow(shop),
      timezone: tz,
      onlineNow: isOnline(shop.id),
      lastSeenAt: monitoring.shopLastSeenAt(shop.id),
    },
    users: users.rows,
    activity: {
      today: { revenue: Number(t.revenue_today), receipts: t.receipts_today },
      last7Days: { revenue: Number(t.revenue_7d), receipts: t.receipts_7d },
      last30Days: { revenue: Number(t.revenue_30d), receipts: t.receipts_30d },
      products: counts.rows[0].products,
      openShifts: counts.rows[0].open_shifts,
    },
    subscription: { ...subscriptionStatus(shop.due_on), payments },
    recentLogins: logins.rows,
    recentAudit: audit.rows,
    devices,
  };
};

// The Health page: the server's own live numbers (monitoringService.js) plus the database's —
// how fast it answers, how many connections are in use, how full it is — the shops online
// right now, and the last day of sign-ins. A database that doesn't answer is reported as
// such rather than failing the page: that's exactly when the admin needs to see it.
const getPlatformHealth = async () => {
  let database;
  try {
    // Timed on the second round trip, so opening a fresh connection isn't counted as latency.
    await pool.query("SELECT 1");
    const started = process.hrtime.bigint();
    await pool.query("SELECT 1");
    const pingMs = Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10;
    const [connections, sizeBytes, capacityBytes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS connections, current_setting('max_connections')::int AS max_connections
         FROM pg_stat_activity WHERE datname = current_database()`
      ),
      getActualDatabaseSizeBytes(),
      getTotalDbCapacityBytes(),
    ]);
    database = {
      ok: true,
      pingMs,
      connections: connections.rows[0].connections,
      maxConnections: connections.rows[0].max_connections,
      sizeBytes,
      capacityBytes,
    };
  } catch (err) {
    database = { ok: false, error: err.message };
  }
  database.pool = poolStats();

  const online = monitoring.onlineShopIds();
  const [names, logins, devices] = await Promise.all([
    database.ok && online.length
      ? pool.query(`SELECT id, name FROM shops WHERE id = ANY($1::int[])`, [online.map((o) => o.shopId)])
      : { rows: [] },
    database.ok ? loginSecuritySummary() : null,
    database.ok ? devicesNeedingAttention() : [],
  ]);
  const nameById = new Map(names.rows.map((r) => [r.id, r.name]));

  return {
    ...monitoring.snapshot(),
    database,
    onlineShops: online
      .map((o) => ({ ...o, name: nameById.get(o.shopId) || `Shop #${o.shopId}` }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    logins,
    // Registers that are behind, offline long, or have sync issues waiting (plan-offline-sync.md).
    devices,
  };
};

// Support actions on one of a shop's users. The user must belong to that shop — an id from
// another shop is simply "not found". Reactivating doesn't check the seat limit, same as an
// owner reactivating their own staff (usersService.js).
const setShopUserActive = async (shopId, userId, isActive) => {
  const { rows } = await pool.query(
    `UPDATE users SET is_active = $3 WHERE id = $1 AND shop_id = $2
     RETURNING id, username, display_name, role, is_active`,
    [userId, shopId, !!isActive]
  );
  if (!rows[0]) throw new ApiError(404, "User not found in this shop");
  return rows[0];
};

// A fresh temp password the admin reads out to the user; they must change it on sign-in.
const resetShopUserPassword = async (shopId, userId) => {
  const issued = await issueTempPassword(pool, userId, { shopId });
  if (!issued) throw new ApiError(404, "User not found in this shop");
  return issued;
};

module.exports = {
  VALID_TIERS,
  getPlatformOverview,
  getPlatformHealth,
  getShopDetail,
  setShopUserActive,
  resetShopUserPassword,
  listShops,
  createShop,
  updateShopDetails,
  getShopOwner,
  updateShopOwner,
  updateShopTier,
  setShopActive,
  changeSuperAdminPassword,
  getUsageByShop,
};
