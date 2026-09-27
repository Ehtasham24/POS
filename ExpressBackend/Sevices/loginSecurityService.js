const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { parsePaging, pagedResult } = require("../utils/pagination");

// Sign-in history and brute-force protection (migration 031's login_events).
//
// A username is locked after MAX_FAILURES_PER_USERNAME wrong passwords within
// LOCK_WINDOW_MINUTES (a successful sign-in starts the count again), and one address after
// MAX_FAILURES_PER_IP failures across any usernames — that one catches someone trying many
// accounts. The lock lifts on its own as the failures age out of the window; nobody has to
// unlock anything. Counting from the database (not memory) keeps it working across restarts.
const LOCK_WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_USERNAME = 5;
const MAX_FAILURES_PER_IP = 30;
const RETENTION_DAYS = 90;

// When the lock over these failures (newest first) lifts, or null if there aren't enough of
// them to lock: the moment the oldest failure that still counts leaves the window.
const lockedUntil = (failureTimes, max) =>
  failureTimes.length >= max
    ? new Date(new Date(failureTimes[max - 1]).getTime() + LOCK_WINDOW_MINUTES * 60 * 1000)
    : null;

const recentFailures = async (column, value, limit, sinceLastSuccess) => {
  const { rows } = await pool.query(
    `SELECT created_at FROM login_events
     WHERE ${column} = $1 AND outcome = 'failure'
       AND created_at > NOW() - make_interval(mins => $2)
       ${
         sinceLastSuccess
           ? `AND created_at > COALESCE(
                (SELECT MAX(created_at) FROM login_events WHERE ${column} = $1 AND outcome = 'success'),
                '-infinity')`
           : ""
       }
     ORDER BY created_at DESC
     LIMIT $3`,
    [value, LOCK_WINDOW_MINUTES, limit]
  );
  return rows.map((r) => r.created_at);
};

const recordLoginEvent = async ({ username, userId = null, shopId = null, outcome, ip, userAgent }) => {
  try {
    await pool.query(
      `INSERT INTO login_events (username, user_id, shop_id, outcome, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [String(username).slice(0, 150), userId, shopId, outcome, ip || null, userAgent ? String(userAgent).slice(0, 300) : null]
    );
  } catch (err) {
    // History is for monitoring — never the reason a sign-in fails.
    console.error("Login event write failed:", err);
  }
};

// Throws 429 when this username or address is locked out; the refused attempt is recorded
// as 'locked' (so the admin sees an attack going on), without the password ever being checked.
const assertLoginAllowed = async (username, { ip, userAgent } = {}) => {
  const [userFailures, ipFailures] = await Promise.all([
    recentFailures("username", username, MAX_FAILURES_PER_USERNAME, true),
    ip ? recentFailures("ip", ip, MAX_FAILURES_PER_IP, false) : [],
  ]);
  const until = [lockedUntil(userFailures, MAX_FAILURES_PER_USERNAME), lockedUntil(ipFailures, MAX_FAILURES_PER_IP)]
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  if (!until) return;

  // Tied to the account when there is one, so the attack shows in that shop's sign-in history.
  const { rows: account } = await pool.query(`SELECT id, shop_id FROM users WHERE username = $1`, [username]);
  await recordLoginEvent({ username, userId: account[0]?.id, shopId: account[0]?.shop_id, outcome: "locked", ip, userAgent });
  const minutes = Math.max(Math.ceil((until - Date.now()) / 60000), 1);
  throw new ApiError(429, `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
};

const listLoginEvents = async ({ outcome, shopId, username, ...paging } = {}) => {
  const { page, pageSize, offset } = parsePaging(paging);
  const conditions = [];
  const params = [];
  if (["success", "failure", "locked"].includes(outcome)) {
    params.push(outcome);
    conditions.push(`e.outcome = $${params.length}`);
  }
  if (shopId) {
    params.push(Number(shopId));
    conditions.push(`e.shop_id = $${params.length}`);
  }
  if (username && username.trim()) {
    params.push(`%${username.trim()}%`);
    conditions.push(`e.username ILIKE $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(pageSize, offset);
  const { rows } = await pool.query(
    `SELECT e.id, e.username, e.outcome, e.ip, e.user_agent, e.created_at, e.shop_id, s.name AS shop_name,
            u.role, COUNT(*) OVER () AS total_count
     FROM login_events e
     LEFT JOIN shops s ON s.id = e.shop_id
     LEFT JOIN users u ON u.id = e.user_id
     ${where}
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return pagedResult(rows, { page, pageSize });
};

// The last 24 hours of sign-ins for the Health page: totals, the usernames and addresses
// with the most failures, and which usernames are locked right now.
const loginSecuritySummary = async () => {
  const [totals, byUsername, byIp] = await Promise.all([
    pool.query(
      `SELECT outcome, COUNT(*)::int AS n FROM login_events
       WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY outcome`
    ),
    pool.query(
      `SELECT username, COUNT(*)::int AS failures, MAX(created_at) AS last_at,
              COUNT(*) FILTER (WHERE created_at > NOW() - make_interval(mins => $1))::int AS recent_failures
       FROM login_events
       WHERE outcome = 'failure' AND created_at > NOW() - INTERVAL '24 hours'
       GROUP BY username ORDER BY failures DESC, last_at DESC LIMIT 5`,
      [LOCK_WINDOW_MINUTES]
    ),
    pool.query(
      `SELECT ip, COUNT(*)::int AS failures, COUNT(DISTINCT username)::int AS usernames, MAX(created_at) AS last_at
       FROM login_events
       WHERE outcome = 'failure' AND created_at > NOW() - INTERVAL '24 hours' AND ip IS NOT NULL
       GROUP BY ip ORDER BY failures DESC, last_at DESC LIMIT 5`
    ),
  ]);
  const count = (outcome) => totals.rows.find((r) => r.outcome === outcome)?.n || 0;
  return {
    last24h: { success: count("success"), failure: count("failure"), locked: count("locked") },
    // "Locked now" is approximate here (it ignores a success in between) — the exact check is
    // assertLoginAllowed's; this is a pointer for the admin, not the gate itself.
    topUsernames: byUsername.rows.map((r) => ({
      username: r.username,
      failures: r.failures,
      lastAt: r.last_at,
      lockedNow: r.recent_failures >= MAX_FAILURES_PER_USERNAME,
    })),
    topIps: byIp.rows.map((r) => ({ ip: r.ip, failures: r.failures, usernames: r.usernames, lastAt: r.last_at })),
    policy: {
      windowMinutes: LOCK_WINDOW_MINUTES,
      maxFailuresPerUsername: MAX_FAILURES_PER_USERNAME,
      maxFailuresPerIp: MAX_FAILURES_PER_IP,
    },
  };
};

const purgeOldLoginEvents = async () => {
  const { rowCount } = await pool.query(
    `DELETE FROM login_events WHERE created_at < NOW() - make_interval(days => $1)`,
    [RETENTION_DAYS]
  );
  return rowCount;
};

module.exports = { assertLoginAllowed, recordLoginEvent, listLoginEvents, loginSecuritySummary, purgeOldLoginEvents };
