// Shared by any query filtered from a plain <input type="date"> (date-only, "YYYY-MM-DD") —
// Shifts and Stock Adjustments, both filtered this way, unlike the rest of the app's
// datetime-local ("YYYY-MM-DDTHH:mm") filters (Sales History, Sales Report), which already
// carry their own explicit start/end-of-day times and stay on a plain BETWEEN.
//
// A raw `column BETWEEN $start AND $end` against a date-only string parses as midnight on
// both ends in Postgres — an instant range of zero duration, matching nothing except a row
// stamped at exactly 00:00:00. Confirmed live: this is exactly what silently broke the
// Shrinkage summary's "View Detail" link (it lands on Stock Adjustments with a same-day
// date-only filter) and, independently, Shifts' own date-range filter for the same reason.
//
// endDate is cast to ::date so a full datetime-local string still works here too (its time
// component is simply dropped, always resolving to the end of that calendar day) — this
// isn't reused by the datetime-local pages above, which need a precise chosen end time, not
// "whatever day that happens to fall in."
const dateRangeCondition = (params, column, startDate, endDate) => {
  params.push(startDate, endDate);
  const startIdx = params.length - 1;
  const endIdx = params.length;
  return `${column} >= $${startIdx}::timestamptz AND ${column} < ($${endIdx}::date + INTERVAL '1 day')`;
};

module.exports = { dateRangeCondition };
