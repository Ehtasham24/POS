import { useEffect, useState } from "react";
import { apiGet } from "utils/api";

// When the app is served by a shop's own device (the Windows/Android app, device/ in the repo)
// rather than the cloud, its backend answers /api/device/status: whether the device is set up,
// which shop it belongs to, and the progress of its first-run setup. The cloud has no such
// route, so there this is null and nothing changes. Fetched once per page load.
let statusPromise = null;
const fetchDeviceStatus = () => {
  statusPromise ??= apiGet("/api/device/status").catch(() => null);
  return statusPromise;
};

// For the setup page, which polls it.
export const refreshDeviceStatus = () => {
  statusPromise = null;
  return fetchDeviceStatus();
};

const POLL_MS = 15000;

// The status kept current while the page is open, on a registered device (its sync state and
// updates change): [status, setStatus]. Null on the cloud and before registration.
export function usePolledDeviceStatus() {
  const initial = useDeviceStatus();
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!initial?.registered) return undefined;
    setStatus(initial);
    const timer = setInterval(() => refreshDeviceStatus().then((s) => s && setStatus(s)), POLL_MS);
    return () => clearInterval(timer);
  }, [initial]);
  return [status, setStatus];
}

export default function useDeviceStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchDeviceStatus().then((value) => alive && setStatus(value));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
