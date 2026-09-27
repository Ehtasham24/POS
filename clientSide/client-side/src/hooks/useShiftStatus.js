import { useEffect, useState } from "react";
import { useAuth } from "auth/AuthContext";
import { useFeature } from "auth/useFeature";
import { apiGet } from "utils/api";

// Whether the logged-in user has a shift open — shared by every place that warns about it
// (register header, the sale panel, the payment screen), so opening a shift anywhere clears
// every warning at once and there's one request, not one per component.
//
// status: null = unknown (loading, or the check itself failed — e.g. offline — so no warning
// is shown rather than a possibly false one); false = no shift open; object = the open shift.
// Advisory only: the real rule is enforced server-side at checkout.
let status = null;
let statusUserId = null; // shifts are per user — a different login starts from "unknown"
let inFlight = null;
const listeners = new Set();

const setStatus = (next) => {
  status = next;
  listeners.forEach((fn) => fn(status));
};

export const refreshShiftStatus = () => {
  if (!inFlight) {
    inFlight = apiGet("/api/shifts/current")
      .then((shift) => setStatus(shift || false))
      .catch(() => setStatus(null))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
};

// Shifts is an Advanced-tier feature; on any other plan there's never anything to warn about
// (and /api/shifts/current would 403), so nothing is fetched and `needsShift` stays false.
export default function useShiftStatus({ refreshOnMount = false } = {}) {
  const hasShifts = useFeature("shifts");
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [current, setCurrent] = useState(statusUserId === userId ? status : null);

  useEffect(() => {
    if (!hasShifts || !userId) return;
    if (statusUserId !== userId) {
      statusUserId = userId;
      setStatus(null);
    }
    listeners.add(setCurrent);
    setCurrent(status);
    if (refreshOnMount || status === null) refreshShiftStatus();
    return () => listeners.delete(setCurrent);
  }, [hasShifts, refreshOnMount, userId]);

  return {
    shift: hasShifts ? current : null,
    needsShift: hasShifts && current === false,
    refresh: refreshShiftStatus,
  };
}
