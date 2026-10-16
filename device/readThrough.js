// Sales History and Sales Report on a register: while it's online they're answered by the cloud,
// so they cover the shop's whole history like the web app; offline (or if the cloud can't
// answer) by this register's own database, which keeps the last 20 days of sales plus whatever
// was sold here since (plan-offline-sync.md). The reads that do this, and how their ids are
// swapped between the two numberings, are in ExpressBackend/utils/readThrough.js.
//
// The answer says which it was: `historySource` "cloud" or "local", and for "local" the oldest
// sale this register holds (`historyFrom`) and why (`historyReason`: "offline", or "sending" —
// online, but this register's newest sales haven't reached the cloud yet), so the page can say
// the list may be cut short.
//
// The cloud only knows about sales this register has already sent. So before asking it, anything
// still waiting to go up is sent first; if that can't be done quickly, the register answers
// itself rather than show a history missing its newest sales.
//
// Support tickets and password changes go only ever to the cloud (tickets aren't kept here, and
// users are the cloud's): offline, or on a register not connected to a cloud shop, they answer
// 503 saying so. A password change is pulled back down before answering, so the new password
// works here at once, offline sign-in included.
const { cloudClient } = require("./cloudClient");
const { readThroughSpec, lookupVia, swapParams, swapIds } = require("../ExpressBackend/utils/readThrough");
const { verifyToken, COOKIE_NAME } = require("../ExpressBackend/utils/auth");

const SEND_FIRST_MS = 5000;
// A cloud refusal that would be the same answered here (a cashier asking for the report, a bad
// date): passed on as it is, not retried locally.
const PASS_ON_STATUSES = new Set([400, 403, 404]);
const CLOUD_TIMEOUT_MS = 15000;
// How long a cloud-only change waits for its result to come back down before answering anyway
// (the next regular sync brings it).
const SYNC_AFTER_MS = 8000;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const readThrough = ({ config, sync, onlineNow }) => {
  // Through the backend's pool, like deviceRoutes.js's own queries.
  const query = (...args) => require("../ExpressBackend/Db").systemPool.query(...args);
  const unsent = async () => (await query(`SELECT EXISTS (SELECT 1 FROM sync_outbox) AS yes`)).rows[0].yes;

  // Lets the usual route answer from this register's database, labelled as such.
  const answerLocally = async (res, next, reason = "offline") => {
    const { rows } = await query(`SELECT MIN(sale_time) AS from FROM sales`);
    const json = res.json.bind(res);
    res.json = (body) =>
      json(res.statusCode < 400 && isPlainObject(body) ? { ...body, historySource: "local", historyFrom: rows[0].from, historyReason: reason } : body);
    next();
  };

  // Who is signed in here, as the cloud knows them (null: nobody, or the session isn't valid —
  // the usual route then answers 401 as it always does).
  const signedInUuid = async (req) => {
    let userId;
    try {
      userId = verifyToken(req.cookies?.[COOKIE_NAME]).id;
    } catch {
      return null;
    }
    const { rows } = await query(`SELECT uuid FROM users WHERE id = $1 AND is_active`, [userId]);
    return rows[0]?.uuid ?? null;
  };

  const cloudUnavailable = (res, message) => res.status(503).send({ code: "NEEDS_CLOUD", message });

  // What this register adds to a support ticket whose sender allowed diagnostics: its sync
  // state and its own backend's errors of the last hour (the cloud never sees those otherwise).
  const deviceReport = () => {
    const { recentServerErrorsFor } = require("../ExpressBackend/Sevices/monitoringService");
    return {
      deviceName: config.deviceName ?? null,
      receiptPrefix: config.receiptPrefix ?? null,
      appVersion: require("./package.json").version,
      lastSyncAt: config.lastSyncAt ?? null,
      sync: sync()?.state() ?? null,
      serverErrors: recentServerErrorsFor(null, 60 * 60 * 1000),
    };
  };

  // A cloud-only request, passed on as it came (query, body, or a picture's bytes back).
  const passToCloud = async (req, res, spec) => {
    if (!config.deviceToken) return cloudUnavailable(res, "This needs the register to be connected to the shop's online account.");
    const userUuid = await signedInUuid(req);
    if (!userUuid) return res.status(401).send({ message: "Not authenticated" });
    let response;
    try {
      response = await fetch(String(config.cloudUrl).replace(/\/+$/, "") + req.originalUrl, {
        method: req.method,
        headers: { "content-type": "application/json", authorization: `Device ${config.deviceToken}`, "x-pos-user": userUuid },
        body:
          req.method === "GET"
            ? undefined
            : JSON.stringify(
                req.method === "POST" && req.path === "/api/support/tickets" && req.body?.diagnostics
                  ? { ...req.body, deviceReport: deviceReport() }
                  : req.body || {}
              ),
        signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
      });
    } catch {
      return cloudUnavailable(res, "This needs the internet — connect and try again.");
    }
    // The cloud not accepting this register isn't the person being signed out here: a 401
    // passed on would log them out of the register.
    if (response.status === 401) return cloudUnavailable(res, "The online account didn't accept this register — check its connection on the Devices page.");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (spec.syncAfter && response.ok) await Promise.race([sync()?.syncNow().catch(() => {}), new Promise((r) => setTimeout(r, SYNC_AFTER_MS))]);
    res.status(response.status);
    res.set("content-type", response.headers.get("content-type") || (spec.binary ? "application/octet-stream" : "application/json"));
    if (spec.binary && response.ok) res.set("cache-control", "private, max-age=86400");
    res.send(buffer);
  };

  return async (req, res, next) => {
    const spec = readThroughSpec(req.method, req.path);
    if (spec?.cloudOnly) return passToCloud(req, res, spec).catch(next);
    if (!spec || !config.deviceToken) return next();
    try {
      // Just started, no sync tried yet: whether it's online isn't known — find out (briefly)
      // rather than answer from local data on a register that's actually connected.
      if (sync()?.state().online === null) await Promise.race([sync().syncNow(), new Promise((r) => setTimeout(r, SEND_FIRST_MS))]);
      if (!onlineNow()) return await answerLocally(res, next);
      const userUuid = await signedInUuid(req);
      if (!userUuid) return next();
      if (await unsent()) {
        await Promise.race([sync().syncNow(), new Promise((r) => setTimeout(r, SEND_FIRST_MS))]);
        if (await unsent()) return await answerLocally(res, next, "sending");
      }

      const isGet = req.method === "GET";
      const params = structuredClone((isGet ? req.query : req.body) || {});
      await swapParams(spec, params, lookupVia(query, config.shopId, "id", "uuid"));
      const body = await cloudClient(config.cloudUrl, { deviceToken: config.deviceToken }).call(
        req.method,
        isGet ? `${req.path}?${new URLSearchParams(params)}` : req.path,
        { body: isGet ? undefined : params, headers: { "x-pos-user": userUuid }, timeoutMs: CLOUD_TIMEOUT_MS }
      );
      await swapIds(spec, body, lookupVia(query, config.shopId, "uuid", "id"));
      res.send(isPlainObject(body) ? { ...body, historySource: "cloud" } : body);
    } catch (err) {
      // The cloud couldn't be asked or refused (connection dropped mid-way, a timeout, a
      // rejected device): this register's own answer is better than none.
      if (res.headersSent) return next(err);
      if (PASS_ON_STATUSES.has(err.status)) return res.status(err.status).send({ message: err.message });
      console.warn(`History read from the cloud failed, answering locally: ${err.message}`);
      answerLocally(res, next).catch(next);
    }
  };
};

module.exports = { readThrough };
