// Shared by TimezoneContext.jsx (React components) AND the non-React print utilities
// (printReceipt.js, buildReceiptBytes.js), which already receive company settings as a plain
// object and can't use hooks — one formatting implementation either way, so "how a date gets
// displayed" is never defined twice.

// This device's own timezone — used as the final fallback when settings can't be reached at
// all (e.g. offline with nothing cached yet). Not the primary default: that's the business
// timezone the backend resolves to (see settingsService.js's DEFAULT_TIMEZONE), which is the
// server machine's own timezone, exposed to the frontend as settings.timezone_default.
export const DEVICE_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// settings.timezone is the owner's explicit override (Settings page); settings.timezone_default
// is the backend's auto-detected one (always present once GetSettings has been reached once).
// Falling further back to DEVICE_TIMEZONE only matters when settings couldn't be fetched at all.
export const resolveTimezone = (settings) =>
  (settings && (settings.timezone || settings.timezone_default)) || DEVICE_TIMEZONE;

export const formatInTimezone = (value, timezone, options) => {
  if (!value) return "";
  const opts = options || { dateStyle: "short", timeStyle: "medium" };
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: timezone || DEVICE_TIMEZONE, ...opts }).format(
      new Date(value)
    );
  } catch (error) {
    // An unrecognized timezone string somehow got through (shouldn't happen — both the
    // Settings UI and the backend validate against Intl.supportedValuesOf('timeZone')) —
    // degrade to the browser's own local time rather than crash whatever was rendering a date.
    console.warn("formatInTimezone: falling back to browser-local time:", error.message);
    return new Date(value).toLocaleString();
  }
};
