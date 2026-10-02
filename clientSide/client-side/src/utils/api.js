// Shared fetch client so the backend base URL lives in one place (env-configurable)
// instead of being hardcoded in every page/component that calls the API.
//
// Default is "" (same-origin, relative requests) — production builds are served by
// Express from the same host/port as the API (see Server.js), so this works correctly
// no matter what IP/hostname a device reaches it on, without baking in a specific LAN
// IP at build time. `npm start`'s two-server dev workflow overrides this explicitly via
// .env.development (REACT_APP_API_BASE_URL=http://localhost:4000), since the CRA dev
// server and the API run on different ports there.
import { clearRequestCache } from "utils/requestCache";

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "";

// On a bad connection a request can hang indefinitely (fetch has no timeout of its own), which
// also means the offline-cache fallbacks never kick in. Reads give up after this long and
// fail as a network error, so the caller falls back to cached data instead of spinning.
// Writes get NO default timeout: a write that timed out on our side may still have been
// applied by the server, and treating it as "never happened" (e.g. queuing a checkout
// offline) could apply it twice. A caller whose POST is a pure read (the Sales Report's
// filters travel in a POST body) marks it { read: true } and may set its own { timeoutMs }.
const DEFAULT_READ_TIMEOUT_MS = 20000;

const request = async (method, path, body, opts = {}) => {
  // credentials:"include" is required for the httpOnly session cookie to round-trip in
  // npm start's dev mode, where the CRA dev server (localhost:3000) and this API
  // (localhost:4000) are a different origin — same-origin in production, where this is a
  // no-op either way. Paired with Server.js's cors({credentials: true}).
  const options = { method, credentials: "include" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  const isRead = method === "GET" || opts.read;
  const timeoutMs = opts.timeoutMs ?? (isRead ? DEFAULT_READ_TIMEOUT_MS : null);
  const controller = new AbortController();
  let timedOut = false;
  const timer = timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : null;
  options.signal = controller.signal;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch (error) {
    // fetch() itself throwing (vs. resolving with a non-2xx response) means the request
    // never reached the server at all — no connection, wrong host, DNS failure, a timeout.
    // Tagged so callers (e.g. the offline-aware checkout flow) can tell "the network is
    // down, queue this for later" apart from "the server rejected this for a real reason,
    // show the cashier why" — those must not be handled the same way.
    if (timedOut) error.message = "The server took too long to respond — check your connection.";
    error.isNetworkError = true;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const error = new Error(errData.message || response.statusText || "Request failed");
    // Machine-readable reason, when the server gives one (e.g. VOUCHER_NEEDS_INTERNET).
    error.code = errData.code;
    error.status = response.status;
    if (response.status === 401) {
      // Distinct from isNetworkError — this means the request *did* reach the server,
      // it just isn't (or is no longer) an authenticated one. Callers that need to tell
      // "logged out" apart from "network down" (offline/connectivity.js,
      // offline/syncManager.js) check this. Also broadcast globally so AuthContext can
      // react immediately (clear the user, redirect to /login) no matter which of the
      // dozens of call sites across the app happened to trigger it — most callers don't
      // need to handle this themselves at all.
      error.isAuthError = true;
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
    throw error;
  }

  // Anything that wrote (a sale, a refund, a void, an edit) may have changed numbers a cached
  // read is holding (utils/requestCache.js) — drop them so the next view is fresh.
  if (!isRead) clearRequestCache();

  if (response.status === 204) return null;
  return response.json().catch(() => null);
};

export const apiGet = (path, opts) => request("GET", path, undefined, opts);
export const apiPost = (path, body, opts) => request("POST", path, body ?? {}, opts);
export const apiPut = (path, body) => request("PUT", path, body ?? {});
export const apiPatch = (path, body) => request("PATCH", path, body ?? {});
export const apiDelete = (path, body) => request("DELETE", path, body);
