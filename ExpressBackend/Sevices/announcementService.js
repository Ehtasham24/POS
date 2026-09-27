const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { TIER_RANK } = require("../config/features");

// Notices from the platform to shops (migration 031): a maintenance window, a new feature,
// a payment reminder. Addressed to every shop or one shop, optionally one tier only, and
// shown as a banner in the shop's app from starts_at until ends_at (or until ended).

const LEVELS = ["info", "warning", "critical"];

// A browser-sent instant ("2026-09-28T10:00:00.000Z") as the UTC wall-clock time the column
// holds; null stays null.
const toUtc = (value, label) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `Invalid ${label}`);
  return date.toISOString().slice(0, 19);
};

const STATUS_SQL = `CASE
    WHEN a.ends_at IS NOT NULL AND a.ends_at <= NOW() THEN 'ended'
    WHEN a.starts_at > NOW() THEN 'scheduled'
    ELSE 'live'
  END`;

const listAnnouncements = async () => {
  const { rows } = await pool.query(
    `SELECT a.id, a.title, a.body, a.level, a.shop_id, s.name AS shop_name, a.tier, a.starts_at, a.ends_at,
            a.created_at, u.display_name AS created_by_name, ${STATUS_SQL} AS status
     FROM announcements a
     LEFT JOIN shops s ON s.id = a.shop_id
     LEFT JOIN users u ON u.id = a.created_by
     ORDER BY (${STATUS_SQL} = 'ended'), a.starts_at DESC, a.id DESC
     LIMIT 200`
  );
  return rows;
};

const createAnnouncement = async ({ title, body, level = "info", shopId, tier, startsAt, endsAt }, adminUserId) => {
  if (!title || !title.trim()) throw new ApiError(400, "Title is required");
  if (!LEVELS.includes(level)) throw new ApiError(400, `Unknown level "${level}"`);
  if (tier && !TIER_RANK[tier]) throw new ApiError(400, `Unknown tier "${tier}"`);
  const start = toUtc(startsAt, "start time");
  const end = toUtc(endsAt, "end time");
  if (end && end <= (start || new Date().toISOString().slice(0, 19))) {
    throw new ApiError(400, "The end time must be after the start");
  }
  const { rows } = await pool.query(
    `INSERT INTO announcements (title, body, level, shop_id, tier, starts_at, ends_at, created_by)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, NOW()), $7, $8)
     RETURNING id, title, level, shop_id, tier, starts_at, ends_at`,
    [title.trim(), (body || "").trim(), level, shopId || null, tier || null, start, end, adminUserId]
  );
  return rows[0];
};

// Takes it down now (a scheduled one is simply cancelled). Kept, not deleted, so the list
// still shows what was sent.
const endAnnouncement = async (id) => {
  const { rows } = await pool.query(
    `UPDATE announcements
     SET ends_at = NOW(), starts_at = LEAST(starts_at, NOW() - INTERVAL '1 second')
     WHERE id = $1 AND (ends_at IS NULL OR ends_at > NOW())
     RETURNING id, title`,
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "No live or scheduled announcement with that id");
  return rows[0];
};

// What a shop's app shows right now (runs as the shop — RLS already hides other shops' ones).
const activeAnnouncementsForShop = async (shopId, tier) => {
  const { rows } = await pool.query(
    `SELECT id, title, body, level, starts_at
     FROM announcements
     WHERE starts_at <= NOW() AND (ends_at IS NULL OR ends_at > NOW())
       AND (shop_id IS NULL OR shop_id = $1) AND (tier IS NULL OR tier = $2)
     ORDER BY CASE level WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, starts_at DESC`,
    [shopId, tier]
  );
  return rows;
};

module.exports = { LEVELS, listAnnouncements, createAnnouncement, endAnnouncement, activeAnnouncementsForShop };
