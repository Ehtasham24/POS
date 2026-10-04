const { systemPool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { findDeviceByToken } = require("../Sevices/deviceService");
const { readThroughSpec, lookupVia, swapParams, swapIds } = require("../utils/readThrough");

// A shop's register reading its Sales History / Sales Report from here while it's online
// (utils/readThrough.js). It sends "Authorization: Device <token>" and, in X-Pos-User, the uuid
// of whoever is signed in on it. The usual route then runs as that person — requireAuth picks
// up req.deviceReadThrough in place of a session cookie — so role rules (a cashier's own sales
// only, the report for owners) apply exactly as on the web. Only the reads READ_THROUGH lists
// are accepted this way; anything else carrying a device token goes on to its route's own
// check and is refused there.
//
// The device token is a shop-wide credential and the register already holds its staff (with
// password hashes), so letting it read as one of them stays inside what it can do anyway. The
// person must belong to the device's shop.
//
// systemPool: these lookups run before any shop context exists (the shop comes from the device
// record), so each one filters by that shop_id itself.
module.exports = async function deviceReadThrough(req, res, next) {
  const spec = readThroughSpec(req.method, req.path);
  const match = /^Device\s+(\S+)$/.exec(req.get("authorization") || "");
  if (!spec || !match) return next();
  try {
    const device = await findDeviceByToken(match[1]);
    if (!device || device.status !== "active" || !device.shop_is_active) throw new ApiError(401, "Unknown device");
    const { rows } = await systemPool.query(`SELECT id FROM users WHERE uuid::text = $1 AND shop_id = $2`, [
      req.get("x-pos-user") || "",
      device.shop_id,
    ]);
    if (!rows[0]) throw new ApiError(401, "Unknown user for this device");

    const query = (...args) => systemPool.query(...args);
    await swapParams(spec, req.method === "GET" ? req.query : req.body, lookupVia(query, device.shop_id, "uuid", "id"));
    req.deviceReadThrough = { userId: rows[0].id, shopId: device.shop_id };

    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 400) return json(body);
      swapIds(spec, body, lookupVia(query, device.shop_id, "id", "uuid")).then(json, next);
      return res;
    };
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : new ApiError(503, "Database temporarily unavailable — please try again"));
  }
};
