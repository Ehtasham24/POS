import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiGet } from "utils/api";
import { withFallback, getSettings as getOfflineSettings } from "offline/cache";
import { DEVICE_TIMEZONE, resolveTimezone, formatInTimezone } from "utils/timezone";

// Consistent-for-everyone display (confirmed decision): a sale/receipt/report should show
// the same time regardless of which device or browser it's viewed from, not each viewer's
// own local timezone — same as how a real receipt's printed time doesn't change depending
// on who's holding it later. DEVICE_TIMEZONE is only the seed value before the first fetch
// resolves (and the final fallback if settings can never be reached at all).
const TimezoneContext = createContext({
  timezone: DEVICE_TIMEZONE,
  formatDateTime: (value, options) => formatInTimezone(value, DEVICE_TIMEZONE, options),
  refresh: async () => {},
});

export function TimezoneProvider({ children }) {
  const [timezone, setTimezone] = useState(DEVICE_TIMEZONE);

  const refresh = useCallback(async () => {
    try {
      const settings = await withFallback(() => apiGet("/api/settings"), getOfflineSettings);
      setTimezone(resolveTimezone(settings));
    } catch {
      // Keep whatever we already had rather than reset to DEVICE_TIMEZONE on a transient
      // failure — a brief blip shouldn't make already-correct times flicker to the wrong zone.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const formatDateTime = useCallback((value, options) => formatInTimezone(value, timezone, options), [timezone]);

  const value = useMemo(() => ({ timezone, formatDateTime, refresh }), [timezone, formatDateTime, refresh]);

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

export const useTimezone = () => useContext(TimezoneContext);
