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
const { cloudClient } = require("./cloudClient");
const { readThroughSpec, lookupVia, swapParams, swapIds } = require("../ExpressBackend/utils/readThrough");
const { verifyToken, COOKIE_NAME } = require("../ExpressBackend/utils/auth");

const SEND_FIRST_MS = 5000;
// A cloud refusal that would be the same answered here (a cashier asking for the report, a bad
// date): passed on as it is, not retried locally.
const PASS_ON_STATUSES = new Set([400, 403, 404]);
const CLOUD_TIMEOUT_MS = 15000;

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

  return async (req, res, next) => {
    const spec = readThroughSpec(req.method, req.path);
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
