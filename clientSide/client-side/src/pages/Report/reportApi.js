import { apiGet, apiPost } from "utils/api";
import { cachedRequest } from "utils/requestCache";

// Every Sales Report read: cached for a minute (going back to a range/filter just viewed is
// instant and free on a slow link) and bounded by a timeout, so a stalled request surfaces as
// an error instead of an endless spinner. These POSTs only read — the filters travel in the body.
const REPORT_TIMEOUT_MS = 30000;

export const reportPost = (path, body) =>
  cachedRequest(`report:${path}:${JSON.stringify(body)}`, () =>
    apiPost(path, body, { read: true, timeoutMs: REPORT_TIMEOUT_MS }),
  );

export const reportGet = (path) => cachedRequest(`report:${path}`, () => apiGet(path, { timeoutMs: REPORT_TIMEOUT_MS }));

// Uncached, longer timeout — for the one-off "every product" fetch behind Print.
export const reportPostOnce = (path, body) => apiPost(path, body, { read: true, timeoutMs: 60000 });
