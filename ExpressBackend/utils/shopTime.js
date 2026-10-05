// Date filters arrive as the shop's own wall-clock time ("2026-09-07T00:00", straight from a
// datetime-local input), but sale times are stored as UTC wall-clock timestamps (Db.js).
// Comparing the two as-is shifts every range by the shop's UTC offset — in Pakistan (UTC+5)
// "7 Sep, 00:00–23:59" matched 7 Sep 05:00 to 8 Sep 04:59, so sales after midnight landed in
// the day before. These convert a wall-clock time in the shop's timezone to the UTC
// wall-clock string those columns hold.
//
// Timezones come from Intl where Node has it. nodejs-mobile (the Android register) is built
// without Intl at all, so there they come from the database's own copy of the IANA timezone
// database instead (Postgres has one, and so does the register's PGlite).
const { systemPool } = require("../Db");

const HAS_INTL = typeof Intl !== "undefined";

// The machine's own timezone, the default when a shop hasn't picked one. Without Intl there's no
// asking the system, so it's POS_TIMEZONE if the app sets it, else Pakistan's — a registered
// register gets its shop's chosen timezone from the cloud anyway.
const systemTimeZone = () => (HAS_INTL ? Intl.DateTimeFormat().resolvedOptions().timeZone : process.env.POS_TIMEZONE || "Asia/Karachi");

let knownZones = HAS_INTL ? new Set(Intl.supportedValuesOf("timeZone")) : null;
const isKnownTimeZone = async (timeZone) => {
  if (typeof timeZone !== "string") return false;
  if (!knownZones) {
    // A catalogue read, the same for every shop.
    const { rows } = await systemPool.query(`SELECT name FROM pg_timezone_names`);
    knownZones = new Set(rows.map((r) => r.name));
  }
  return knownZones.has(timeZone);
};

// How far `timeZone`'s clock is ahead of UTC at `instant`, in ms.
const utcOffsetMs = (instant, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)])
  );
  const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallClock - Math.floor(instant.getTime() / 1000) * 1000;
};

// "YYYY-MM-DD[THH:mm[:ss]]" on the shop's clock -> "YYYY-MM-DDTHH:mm:ss" in UTC, or null
// when it isn't a date at all.
const shopTimeToUtc = async (value, timeZone) => {
  const text = String(value).trim().replace(" ", "T").replace(/Z$/, "");
  const wallClock = new Date(`${/T/.test(text) ? text : `${text}T00:00`}Z`).getTime();
  if (Number.isNaN(wallClock)) return null;
  if (!HAS_INTL) {
    const { rows } = await systemPool.query(
      `SELECT to_char(($1::timestamp AT TIME ZONE $2) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS utc`,
      [new Date(wallClock).toISOString().slice(0, 19), timeZone]
    );
    return rows[0].utc;
  }
  // Twice, so a time right next to a daylight-saving change lands on the correct side of it.
  let utc = wallClock - utcOffsetMs(new Date(wallClock), timeZone);
  utc = wallClock - utcOffsetMs(new Date(utc), timeZone);
  return new Date(utc).toISOString().slice(0, 19);
};

module.exports = { shopTimeToUtc, systemTimeZone, isKnownTimeZone };
