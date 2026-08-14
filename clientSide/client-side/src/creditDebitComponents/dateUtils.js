// Local (not UTC) "YYYY-MM-DD" — the format <input type="date"> expects, and what's sent
// straight to the backend as `occurredOn` (a plain date string, no JS Date/toISOString
// round-trip) so there's no risk of a UTC-conversion shifting the date by a day depending
// on the browser's timezone — the same footgun pages/SalesHistory/index.jsx's `formatLocal`
// avoids for datetime-local inputs.
export const todayDateInputValue = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
