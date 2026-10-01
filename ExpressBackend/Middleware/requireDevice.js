const { runAsTenant } = require("../Db");
const ApiError = require("../utils/ApiError");
const { findDeviceByToken } = require("../Sevices/deviceService");

// Sync routes are called by a shop's registered device, not by a person: it sends
// "Authorization: Device <token>" (the token it got at registration). A retired or blocked
// device, or one whose shop has been deactivated, is refused. Like requireAuth, everything
// after this runs pinned to the device's shop (Db.js) — the shop comes from the device record,
// never from the request.
module.exports = async function requireDevice(req, res, next) {
  const match = /^Device\s+(\S+)$/.exec(req.get("authorization") || "");
  let device;
  try {
    device = match ? await findDeviceByToken(match[1]) : null;
  } catch (err) {
    return next(new ApiError(503, "Database temporarily unavailable — please try again"));
  }
  if (!device) return next(new ApiError(401, "Unknown device"));
  if (device.status !== "active") return next(new ApiError(401, `This device was ${device.status} — register it again`));
  if (!device.shop_is_active) return next(new ApiError(401, "Shop is no longer active"));

  req.device = device;
  req.shop = { id: device.shop_id, tier: device.shop_tier };
  return runAsTenant(device.shop_id, next);
};
