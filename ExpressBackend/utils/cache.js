const Redis = require("ioredis");

// Optional performance layer — a handful of read-heavy, rarely-written endpoints
// (categories, settings, the inventory summary) go through withCache() instead of
// hitting Postgres on every request. Deliberately fails open: if Redis is down/unset,
// every helper below falls back to "no cache" (straight to the DB) rather than ever
// taking the app down or returning stale-forever data because of a cache outage.
//
// REDIS_URL is optional — unset in Development.env means caching is simply off.
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1, // fail a single call fast instead of queuing/hanging
      retryStrategy: (times) => Math.min(times * 500, 5000),
      lazyConnect: false,
    })
  : null;

let loggedConnectionError = false;
if (redis) {
  redis.on("error", (err) => {
    // ioredis retries forever in the background and re-fires 'error' on every failed
    // attempt — log once so a Redis outage doesn't spam the server log per request.
    if (!loggedConnectionError) {
      console.error("Redis unavailable, caching disabled until it recovers:", err.message);
      loggedConnectionError = true;
    }
  });
  redis.on("connect", () => {
    loggedConnectionError = false;
  });
}

// Read-through cache: serves `key` from Redis if present, otherwise calls `load()`,
// caches its result for `ttlSeconds`, and returns it. `load` is only ever called on a
// cache miss (or when Redis itself is unreachable), so it's always safe to pass the
// real DB query as-is.
const withCache = async (key, ttlSeconds, load) => {
  if (!redis || redis.status !== "ready") return load();

  try {
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached);
  } catch (err) {
    console.error(`Cache read failed for "${key}":`, err.message);
  }

  const fresh = await load();

  try {
    await redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
  } catch (err) {
    console.error(`Cache write failed for "${key}":`, err.message);
  }

  return fresh;
};

// Called from the (few) write paths for cached data, so an edit is visible immediately
// instead of waiting out the TTL. Safe to call even when Redis is unset/unreachable.
const invalidate = async (...keys) => {
  if (!redis || redis.status !== "ready" || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    console.error(`Cache invalidation failed for [${keys.join(", ")}]:`, err.message);
  }
};

module.exports = { withCache, invalidate };
