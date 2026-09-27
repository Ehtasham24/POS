const { monitorEventLoopDelay } = require("perf_hooks");

// Live health numbers for the admin console's Health page: request rate, errors and response
// times per minute for the last hour, the slowest endpoints, the latest server errors, which
// shops are online, and when the background jobs last ran.
//
// Kept in this process's memory on purpose — it's what the server is doing right now, it
// costs nothing per request (no database write), and it resets on restart (the page shows
// since when). Anything that has to survive a restart is in the database instead: egress
// (shop_egress_daily), sign-ins (login_events), admin actions (admin_audit_log).

const MINUTES_KEPT = 60;
// Per minute, the response times kept for the percentiles. Past this, a random sample is
// kept (reservoir sampling), so a busy minute costs the same memory as a quiet one.
const SAMPLES_PER_MINUTE = 2000;
const SAMPLES_PER_ROUTE = 500;
const RECENT_ERRORS_KEPT = 50;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const startedAt = new Date();
const minutes = new Map(); // epoch minute -> { requests, clientErrors, serverErrors, durations[] }
const routes = new Map(); // "GET /api/Sales/summary" -> { count, serverErrors, totalMs, maxMs, durations[] }
const recentErrors = [];
const shopLastSeen = new Map(); // shopId -> ms
const jobs = new Map(); // name -> { lastRunAt, lastOkAt, lastError, lastResult, runs, failures }

// The histogram's samples include its own sampling interval — subtracted when reported.
const LOOP_RESOLUTION_MS = 10;
const eventLoop = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
eventLoop.enable();
const loopLag = (ns) => round(Math.max(0, ns / 1e6 - LOOP_RESOLUTION_MS));

const keepSample = (samples, value, limit, seen) => {
  if (samples.length < limit) samples.push(value);
  else {
    const slot = Math.floor(Math.random() * seen);
    if (slot < limit) samples[slot] = value;
  }
};

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const round = (ms) => (ms == null ? null : Math.round(ms * 10) / 10);

// Called once per finished API request (server.js). `route` is the matched route pattern
// ("/api/admin/shops/:id"), so ids don't split one endpoint into thousands of rows.
const recordRequest = ({ method, route, status, durationMs, shopId }) => {
  const key = Math.floor(Date.now() / 60000);
  let bucket = minutes.get(key);
  if (!bucket) {
    bucket = { requests: 0, clientErrors: 0, serverErrors: 0, durations: [] };
    minutes.set(key, bucket);
    for (const old of minutes.keys()) if (old <= key - MINUTES_KEPT) minutes.delete(old);
  }
  bucket.requests += 1;
  if (status >= 500) bucket.serverErrors += 1;
  else if (status >= 400) bucket.clientErrors += 1;
  keepSample(bucket.durations, durationMs, SAMPLES_PER_MINUTE, bucket.requests);

  const label = `${method} ${route}`;
  let stats = routes.get(label);
  if (!stats) {
    stats = { count: 0, serverErrors: 0, totalMs: 0, maxMs: 0, durations: [] };
    routes.set(label, stats);
  }
  stats.count += 1;
  if (status >= 500) stats.serverErrors += 1;
  stats.totalMs += durationMs;
  stats.maxMs = Math.max(stats.maxMs, durationMs);
  keepSample(stats.durations, durationMs, SAMPLES_PER_ROUTE, stats.count);

  if (shopId) shopLastSeen.set(shopId, Date.now());
};

// Called by the error handler for every 5xx — the message the server logged, not the one
// the user saw (which may be the generic "Internal server error").
const recordServerError = ({ method, path, status, message, shopId, userId }) => {
  recentErrors.unshift({ at: new Date(), method, path, status, message: String(message || "").slice(0, 500), shopId, userId });
  recentErrors.length = Math.min(recentErrors.length, RECENT_ERRORS_KEPT);
};

// Wraps a background job's run so the Health page can show when it last ran and whether it
// worked. Rethrows, so the job's own error handling is unchanged.
const trackJob = async (name, run) => {
  const job = jobs.get(name) || { runs: 0, failures: 0, lastRunAt: null, lastOkAt: null, lastError: null, lastResult: null };
  jobs.set(name, job);
  job.runs += 1;
  job.lastRunAt = new Date();
  try {
    const result = await run();
    job.lastOkAt = new Date();
    job.lastResult = result ?? null;
    job.lastError = null;
    return result;
  } catch (err) {
    job.failures += 1;
    job.lastError = String(err?.message || err).slice(0, 300);
    throw err;
  }
};

const onlineShopIds = () => {
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  return [...shopLastSeen.entries()].filter(([, at]) => at >= cutoff).map(([id, at]) => ({ shopId: id, lastSeenAt: new Date(at) }));
};

const shopLastSeenAt = (shopId) => (shopLastSeen.has(shopId) ? new Date(shopLastSeen.get(shopId)) : null);

const snapshot = () => {
  const nowKey = Math.floor(Date.now() / 60000);
  const series = [];
  const allDurations = [];
  let requests = 0;
  let serverErrors = 0;
  let clientErrors = 0;
  for (let key = nowKey - MINUTES_KEPT + 1; key <= nowKey; key++) {
    const b = minutes.get(key);
    series.push({
      minute: new Date(key * 60000),
      requests: b?.requests || 0,
      serverErrors: b?.serverErrors || 0,
      clientErrors: b?.clientErrors || 0,
      p50: round(percentile(b?.durations || [], 50)),
      p95: round(percentile(b?.durations || [], 95)),
    });
    if (b) {
      requests += b.requests;
      serverErrors += b.serverErrors;
      clientErrors += b.clientErrors;
      allDurations.push(...b.durations);
    }
  }
  const lastFive = series.slice(-5);
  const endpoints = [...routes.entries()]
    .map(([label, s]) => ({
      label,
      count: s.count,
      serverErrors: s.serverErrors,
      avgMs: round(s.totalMs / s.count),
      p95Ms: round(percentile(s.durations, 95)),
      maxMs: round(s.maxMs),
    }))
    .sort((a, b) => b.p95Ms - a.p95Ms)
    .slice(0, 10);
  const memory = process.memoryUsage();

  return {
    startedAt,
    uptimeSeconds: Math.round(process.uptime()),
    lastHour: {
      requests,
      serverErrors,
      clientErrors,
      errorRatePercent: requests ? round((serverErrors / requests) * 100) : 0,
      p50Ms: round(percentile(allDurations, 50)),
      p95Ms: round(percentile(allDurations, 95)),
      p99Ms: round(percentile(allDurations, 99)),
    },
    requestsPerMinute: round(lastFive.reduce((sum, m) => sum + m.requests, 0) / lastFive.length),
    series,
    slowestEndpoints: endpoints,
    recentErrors: recentErrors.slice(0, 20),
    process: {
      node: process.version,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      // How long the server is stuck before it can answer anything — high numbers mean one
      // slow synchronous piece of work is holding every request up.
      eventLoopLagMs: { p50: loopLag(eventLoop.percentile(50)), p99: loopLag(eventLoop.percentile(99)), max: loopLag(eventLoop.max) },
    },
    jobs: [...jobs.entries()].map(([name, job]) => ({ name, ...job })),
  };
};

// The event-loop numbers cover the last few minutes, not the whole uptime.
setInterval(() => eventLoop.reset(), 5 * 60 * 1000).unref();

module.exports = { recordRequest, recordServerError, trackJob, onlineShopIds, shopLastSeenAt, snapshot, ONLINE_WINDOW_MS };
