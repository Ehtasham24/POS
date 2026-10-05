const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { shopTimeToUtc, systemTimeZone, isKnownTimeZone } = require("../utils/shopTime");
const { withCache, invalidate } = require("../utils/cache");

// This machine's own OS timezone — the sensible zero-configuration default ("by default use
// whichever timezone the system is running in"). Resolved once at startup, not per-call: it
// can't change while the process is running. (utils/shopTime.js: also on Android, without Intl.)
const DEFAULT_TIMEZONE = systemTimeZone();

// Tiny key-value table, but read constantly — not just by the Settings page: every
// sales list/report/void query calls getBusinessTimezone() below (sometimes more than
// once per request, see salesService.js), and getInventory() reads the low-stock
// threshold from here too. Cached for 5 minutes and invalidated immediately on write,
// so e.g. changing the timezone in Settings takes effect on the very next request
// rather than up to 5 minutes later. Keyed per-shop — this is the single hottest
// per-shop read in the app, so a shared cache key would mean Shop A's timezone/threshold
// intermittently serving Shop B's requests instead of ever erroring, one of the quietest
// possible cross-tenant bugs.
const settingsCacheKey = (shopId) => `settings:${shopId}`;
const SETTINGS_CACHE_TTL_SECONDS = 300;

const getSettings = async (shopId) => {
  return withCache(settingsCacheKey(shopId), SETTINGS_CACHE_TTL_SECONDS, async () => {
    const result = await pool.query("SELECT key, value FROM settings WHERE shop_id = $1", [shopId]);
    return result.rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  });
};

// The effective business timezone — used everywhere a "today"/day-boundary business rule
// needs to agree with what's actually displayed (cashier's today-only sales filter, void's
// same-day check, Sales Report's daily grouping — see salesService.js). Falls back to
// DEFAULT_TIMEZONE whenever unset OR somehow invalid, rather than ever letting a bad value
// silently break every date-boundary check in the app.
const getBusinessTimezone = async (shopId) => {
  const settings = await getSettings(shopId);
  return (await isKnownTimeZone(settings.timezone)) ? settings.timezone : DEFAULT_TIMEZONE;
};

// A date filter's two ends, typed on the shop's own clock, as the UTC times the sale/stock
// columns hold — see utils/shopTime.js for why comparing them directly was wrong.
const shopRangeToUtc = async (startDate, endDate, shopId) => {
  const timeZone = await getBusinessTimezone(shopId);
  const range = await Promise.all([startDate, endDate].map((value) => (value ? shopTimeToUtc(value, timeZone) : null)));
  if (range.includes(null)) {
    throw new ApiError(400, "Invalid date inputs. Please provide valid start and end dates.");
  }
  return range;
};

const updateSetting = async (key, value, shopId) => {
  // Empty string is a valid value here — it means "clear the override, go back to auto" —
  // only a genuinely non-empty, unrecognized value is rejected. The Settings UI only ever
  // offers real IANA zone names as options (Intl.supportedValuesOf('timeZone') on the
  // frontend too) so this should never actually trigger from normal use; it's here in case
  // something else ever calls this endpoint directly.
  if (key === "timezone" && value && !(await isKnownTimeZone(value))) {
    throw new ApiError(400, `"${value}" is not a recognized timezone`);
  }

  const result = await pool.query(
    `INSERT INTO settings(shop_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (shop_id, key) DO UPDATE SET value = EXCLUDED.value
     RETURNING key, value`,
    [shopId, key, String(value)]
  );
  await invalidate(settingsCacheKey(shopId));
  return result.rows[0];
};

module.exports = { getSettings, updateSetting, getBusinessTimezone, shopRangeToUtc, DEFAULT_TIMEZONE };
