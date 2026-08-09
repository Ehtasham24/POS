// Shared fetch client so the backend base URL lives in one place (env-configurable)
// instead of being hardcoded in every page/component that calls the API.
//
// Default is "" (same-origin, relative requests) — production builds are served by
// Express from the same host/port as the API (see Server.js), so this works correctly
// no matter what IP/hostname a device reaches it on, without baking in a specific LAN
// IP at build time. `npm start`'s two-server dev workflow overrides this explicitly via
// .env.development (REACT_APP_API_BASE_URL=http://localhost:4000), since the CRA dev
// server and the API run on different ports there.
export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "";

const request = async (method, path, body) => {
  const options = { method };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch (error) {
    // fetch() itself throwing (vs. resolving with a non-2xx response) means the request
    // never reached the server at all — no connection, wrong host, DNS failure, etc.
    // Tagged so callers (e.g. the offline-aware checkout flow) can tell "the network is
    // down, queue this for later" apart from "the server rejected this for a real reason,
    // show the cashier why" — those must not be handled the same way.
    error.isNetworkError = true;
    throw error;
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || response.statusText || "Request failed");
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
};

export const apiGet = (path) => request("GET", path);
export const apiPost = (path, body) => request("POST", path, body ?? {});
export const apiPut = (path, body) => request("PUT", path, body ?? {});
export const apiPatch = (path, body) => request("PATCH", path, body ?? {});
export const apiDelete = (path, body) => request("DELETE", path, body);
