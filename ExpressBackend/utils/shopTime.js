// Date filters arrive as the shop's own wall-clock time ("2026-09-07T00:00", straight from a
// datetime-local input), but sale times are stored as UTC wall-clock timestamps (Db.js).
// Comparing the two as-is shifts every range by the shop's UTC offset — in Pakistan (UTC+5)
// "7 Sep, 00:00–23:59" matched 7 Sep 05:00 to 8 Sep 04:59, so sales after midnight landed in
// the day before. These convert a wall-clock time in the shop's timezone to the UTC
// wall-clock string those columns hold.

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
const shopTimeToUtc = (value, timeZone) => {
  const text = String(value).trim().replace(" ", "T").replace(/Z$/, "");
  const wallClock = new Date(`${/T/.test(text) ? text : `${text}T00:00`}Z`).getTime();
  if (Number.isNaN(wallClock)) return null;
  // Twice, so a time right next to a daylight-saving change lands on the correct side of it.
  let utc = wallClock - utcOffsetMs(new Date(wallClock), timeZone);
  utc = wallClock - utcOffsetMs(new Date(utc), timeZone);
  return new Date(utc).toISOString().slice(0, 19);
};

module.exports = { shopTimeToUtc };
