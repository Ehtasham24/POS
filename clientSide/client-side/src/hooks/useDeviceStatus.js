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
