const Redis = require("ioredis");

// Performance layer — a handful of read-heavy, rarely-written things (categories, settings,
// the inventory summary, storage usage) go through withCache() instead of hitting Postgres
// on every request.
//
// Where the cache lives: Redis when REDIS_URL is set (shared by several server processes),
// otherwise this process's own memory — the app runs as one Node process, so that's the same
// cache in practice, and it's what makes caching work at all without Redis (before, no
// REDIS_URL meant no caching, and e.g. the storage badge re-measured 14 tables on every page).
// A configured Redis that's down fails open to "no cache" (straight to the DB), never to
// memory, so several processes can't drift apart.
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

// key -> { json, expiresAt }. Stored as JSON, exactly as Redis stores it, so a value reads back
// the same shape (and a caller can't mutate the cached copy) whichever backend is in use.
const memory = new Map();
const MEMORY_MAX_KEYS = 5000;

const memoryGet = (key) => {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.json;
};
const memorySet = (key, json, ttlSeconds) => {
  if (memory.size >= MEMORY_MAX_KEYS) memory.delete(memory.keys().next().value);
  memory.set(key, { json, expiresAt: Date.now() + ttlSeconds * 1000 });
};

// Read-through cache: serves `key` from the cache if present, otherwise calls `load()`,
// caches its result for `ttlSeconds`, and returns it. `load` is only ever called on a
// cache miss (or when Redis itself is unreachable), so it's always safe to pass the
// real DB query as-is.
const withCache = async (key, ttlSeconds, load) => {
  if (!redis) {
    const cached = memoryGet(key);
    if (cached !== null) return JSON.parse(cached);
    const fresh = await load();
    memorySet(key, JSON.stringify(fresh), ttlSeconds);
    return fresh;
  }
  if (redis.status !== "ready") return load();

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
  if (!redis) {
    keys.forEach((key) => memory.delete(key));
    return;
  }
  if (redis.status !== "ready" || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    console.error(`Cache invalidation failed for [${keys.join(", ")}]:`, err.message);
  }
};

module.exports = { withCache, invalidate };
