import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

// One filter value kept in sync with a URL query param — so it survives a browser
// back/forward navigation (e.g. Sales Report -> "View Detail" on a Stock Adjustments row
// -> Back), a page refresh, and still seeds correctly from a deep link someone else built
// (StockAdjustments/SalesHistory's own existing `useSearchParams`-seed-on-mount pattern).
// A plain `useState` filter resets to its default on every remount, which is exactly what a
// route change/back-navigation does — this is the fix for that class of bug, generalized so
// any page can use it instead of each re-inventing its own read/write-to-the-URL glue.
//
// `replace: true` on every write — adjusting a filter shouldn't push a new browser-history
// entry per keystroke/change (that would make the Back button step through every filter
// tweak instead of leaving the page); the URL still reflects the current filter for
// deep-linking and for survives-a-remount purposes either way.
//
// Builds the next URLSearchParams from the CURRENT `searchParams` snapshot rather than
// passing a functional updater to setSearchParams — this app's react-router-dom (6.0.2)
// predates functional-updater support: its setSearchParams does
// `navigate("?" + createSearchParams(nextInit), ...)`, feeding nextInit straight into
// createSearchParams with no function branch, so passing a function silently produced an
// EMPTY URLSearchParams (a function has no iterable entries), wiping every filter back to
// its default on the very first change. Caught live via browser testing — every single
// onChange (date, filter type, payment medium) reset the whole page instead of applying
// the pick. `searchParams` is a dependency here so each render's setValue closes over a
// fresh snapshot, same effect the functional-updater form would have given if it existed.
export default function useUrlFilterState(key, defaultValue) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawValue = searchParams.get(key);
  const value = rawValue === null || rawValue === "" ? defaultValue : rawValue;

  const setValue = useCallback(
    (next) => {
      const updated = new URLSearchParams(searchParams);
      if (next === null || next === undefined || next === "") {
        updated.delete(key);
      } else {
        updated.set(key, next);
      }
      setSearchParams(updated, { replace: true });
    },
    [key, searchParams, setSearchParams]
  );

  return [value, setValue];
}
