// Short-lived in-memory cache for read requests that are expensive on a slow link (the Sales
// Report's aggregates). Going back to a range or filter already viewed a moment ago is
// instant and costs no network, and two identical requests in flight at once share one.
// Only for data where being up to `ttlMs` old is fine — never for anything a sale depends on.
const entries = new Map(); // key -> { expires, promise }
const MAX_ENTRIES = 60;

export const cachedRequest = (key, fetcher, ttlMs = 60000) => {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expires > now) return hit.promise;

  const promise = fetcher().catch((error) => {
    entries.delete(key); // never cache a failure
    throw error;
  });
  entries.set(key, { expires: now + ttlMs, promise });
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
  return promise;
};

// Called by utils/api.js after every successful write, so a read never outlives a change.
export const clearRequestCache = () => entries.clear();
