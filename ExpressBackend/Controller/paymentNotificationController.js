const asyncHandler = require("../utils/asyncHandler");
const { handleIncomingNotification } = require("../Sevices/PaymentNotifications/matchingService");
const { getSettings, updateSetting } = require("../Sevices/settingsService");

const HEARTBEAT_KEY = "bank_notification_forwarder_last_heartbeat";
// If the phone hasn't checked in within this long, the frontend (Pending Bank Payments
// page) shows a "forwarder may be down" warning — see GetForwarderStatus below. Twice the
// HeartbeatWorker's own ~10 min interval on the phone side, so one missed beat (a brief
// network hiccup) doesn't immediately look like an outage.
const STALE_AFTER_MINUTES = 20;

// KNOWN LIMITATION (multi-tenancy): NOTIFICATION_FORWARDER_SECRET (requireForwarderSecret.js)
// is one single, global secret for the whole server — there's no per-shop forwarder
// identity yet, so a webhook call from the phone app has no req.shop to read. Hardcoded to
// shop 1 (today's only real shop) rather than left undefined, which would otherwise throw
// on settings' NOT NULL shop_id. Supporting a second shop's own phone forwarder needs its
// own secret-per-shop design (e.g. a shops.forwarder_secret column) before this can be
// anything other than shop 1 — tracked as a follow-up, not fixed in this pass.
const FORWARDER_SHOP_ID = 1;

const ReceiveNotification = asyncHandler(async (req, res) => {
  const { packageName, title, text, postedAt } = req.body;
  if (!packageName || !text) {
    return res.status(400).send({ message: "packageName and text are required" });
  }
  const result = await handleIncomingNotification({ packageName, title, text, postedAt });
  res.send(result);
});

const ReceiveHeartbeat = asyncHandler(async (req, res) => {
  await updateSetting(HEARTBEAT_KEY, new Date().toISOString(), FORWARDER_SHOP_ID);
  res.status(204).send();
});

// Any logged-in staff (requireAuth only) — purely a status readout for the Pending Bank
// Payments page's "is the forwarder alive" banner, same operational-visibility trust
// level as the page itself.
const GetForwarderStatus = asyncHandler(async (req, res) => {
  const settings = await getSettings(FORWARDER_SHOP_ID);
  const lastHeartbeatAt = settings[HEARTBEAT_KEY] || null;
  const isStale =
    !lastHeartbeatAt || Date.now() - new Date(lastHeartbeatAt).getTime() > STALE_AFTER_MINUTES * 60 * 1000;
  res.send({ lastHeartbeatAt, isStale, staleAfterMinutes: STALE_AFTER_MINUTES });
});

module.exports = { ReceiveNotification, ReceiveHeartbeat, GetForwarderStatus };
