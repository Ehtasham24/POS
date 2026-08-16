const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");

// This machine's own OS timezone — the sensible zero-configuration default ("by default use
// whichever timezone the system is running in"). Resolved once at startup, not per-call: it
// can't change while the process is running.
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const VALID_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));
const isValidTimezone = (tz) => typeof tz === "string" && VALID_TIMEZONES.has(tz);

const getSettings = async () => {
  const result = await pool.query("SELECT key, value FROM settings");
  return result.rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
};

// The effective business timezone — used everywhere a "today"/day-boundary business rule
// needs to agree with what's actually displayed (cashier's today-only sales filter, void's
// same-day check, Sales Report's daily grouping — see salesService.js). Falls back to
// DEFAULT_TIMEZONE whenever unset OR somehow invalid, rather than ever letting a bad value
// silently break every date-boundary check in the app.
const getBusinessTimezone = async () => {
  const settings = await getSettings();
  return isValidTimezone(settings.timezone) ? settings.timezone : DEFAULT_TIMEZONE;
};

const updateSetting = async (key, value) => {
  // Empty string is a valid value here — it means "clear the override, go back to auto" —
  // only a genuinely non-empty, unrecognized value is rejected. The Settings UI only ever
  // offers real IANA zone names as options (Intl.supportedValuesOf('timeZone') on the
  // frontend too) so this should never actually trigger from normal use; it's here in case
  // something else ever calls this endpoint directly.
  if (key === "timezone" && value && !isValidTimezone(value)) {
    throw new ApiError(400, `"${value}" is not a recognized timezone`);
  }

  const result = await pool.query(
    `INSERT INTO settings(key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
     RETURNING key, value`,
    [key, String(value)]
  );
  return result.rows[0];
};

module.exports = { getSettings, updateSetting, getBusinessTimezone, isValidTimezone, DEFAULT_TIMEZONE };
