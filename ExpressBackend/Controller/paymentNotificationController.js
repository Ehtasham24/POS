const asyncHandler = require("../utils/asyncHandler");
const { handleIncomingNotification } = require("../Sevices/PaymentNotifications/matchingService");
const { getSettings, updateSetting } = require("../Sevices/settingsService");
const { generateForShop, getStatusForShop } = require("../Sevices/forwarderSecretService");

const HEARTBEAT_KEY = "bank_notification_forwarder_last_heartbeat";
// If the phone hasn't checked in within this long, the frontend (Pending Bank Payments
// page) shows a "forwarder may be down" warning — see GetForwarderStatus below. Twice the
// HeartbeatWorker's own ~10 min interval on the phone side, so one missed beat (a brief
// network hiccup) doesn't immediately look like an outage.
const STALE_AFTER_MINUTES = 20;

// req.shop on the two webhook handlers comes from the forwarder's own per-shop secret
// (requireForwarderSecret.js) — each shop's phone writes, and is matched against, only its
// own shop's data.
const ReceiveNotification = asyncHandler(async (req, res) => {
  const { packageName, title, text, postedAt } = req.body;
  if (!packageName || !text) {
    return res.status(400).send({ message: "packageName and text are required" });
  }
  const result = await handleIncomingNotification({ packageName, title, text, postedAt }, req.shop.id);
  res.send(result);
});

const ReceiveHeartbeat = asyncHandler(async (req, res) => {
  await updateSetting(HEARTBEAT_KEY, new Date().toISOString(), req.shop.id);
  res.status(204).send();
});

// Any logged-in staff (requireAuth only) — purely a status readout for the Pending Bank
// Payments page's "is the forwarder alive" banner, same operational-visibility trust
// level as the page itself.
const GetForwarderStatus = asyncHandler(async (req, res) => {
  const settings = await getSettings(req.shop.id);
  const lastHeartbeatAt = settings[HEARTBEAT_KEY] || null;
  const isStale =
    !lastHeartbeatAt || Date.now() - new Date(lastHeartbeatAt).getTime() > STALE_AFTER_MINUTES * 60 * 1000;
  res.send({ lastHeartbeatAt, isStale, staleAfterMinutes: STALE_AFTER_MINUTES });
});

const GetForwarderSecretStatus = asyncHandler(async (req, res) => {
  res.send(await getStatusForShop(req.shop.id));
});

// The plaintext secret is in this one response and nowhere else, ever.
const RegenerateForwarderSecret = asyncHandler(async (req, res) => {
  res.status(201).send(await generateForShop(req.shop.id));
});

module.exports = {
  ReceiveNotification,
  ReceiveHeartbeat,
  GetForwarderStatus,
  GetForwarderSecretStatus,
  RegenerateForwarderSecret,
};
