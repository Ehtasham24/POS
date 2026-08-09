// Tracks whether the API is actually reachable — not just whether the network adapter is up
// (navigator.onLine reflects the latter only; a phone can be "online" on WiFi with no route to
// the backend at all, e.g. wrong network or the shop PC being off).
import { apiGet } from "utils/api";

const PING_INTERVAL_MS = 45000; // long interval — see Mobile performance: no aggressive polling
const PING_PATH = "/categories"; // cheap, already-indexed, always-safe-to-call endpoint

let online = navigator.onLine;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(online));

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const isOnline = () => online;

const setOnline = (value) => {
  if (value === online) return;
  online = value;
  notify();
};

export const checkNow = async () => {
  try {
    await apiGet(PING_PATH);
    setOnline(true);
  } catch {
    setOnline(false);
  }
  return online;
};

let started = false;
export const start = () => {
  if (started) return;
  started = true;

  window.addEventListener("online", checkNow);
  window.addEventListener("offline", () => setOnline(false));

  // Skip the interval entirely while the tab/app is backgrounded — a phone in a pocket
  // shouldn't be waking the radio for a POS app nobody's looking at.
  const interval = setInterval(() => {
    if (document.visibilityState === "visible") checkNow();
  }, PING_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkNow();
  });

  checkNow();
  return () => clearInterval(interval);
};
