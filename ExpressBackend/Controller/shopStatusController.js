const asyncHandler = require("../utils/asyncHandler");
const { getShopStorageStatus } = require("../Sevices/storageQuotaService");
const { activeAnnouncementsForShop } = require("../Sevices/announcementService");
const { getShopSubscription } = require("../Sevices/subscriptionService");

// req.shop is set by requireAuth for every shop-bound role (owner/cashier); a superadmin
// has none (migration 022) and was never meant to reach this route in the first place — no
// shop's own header renders for that role — so this just returns "nothing to report"
// rather than erroring if it's ever called that way.
const GetStorageStatus = asyncHandler(async (req, res) => {
  if (!req.shop) {
    return res.send({
      usedBytes: 0,
      estimatedRealBytes: 0,
      quotaBytes: null,
      quotaPercent: null,
      percentUsed: null,
      isNearLimit: false,
    });
  }
  res.send(await getShopStorageStatus(req.shop.id));
});

// What the platform wants this shop to see right now: announcements addressed to it, and —
// for the owner, who is the one paying — where its subscription stands. Staff don't see
// billing.
const GetNotices = asyncHandler(async (req, res) => {
  if (!req.shop) return res.send({ announcements: [], subscription: null });
  const [announcements, subscription] = await Promise.all([
    activeAnnouncementsForShop(req.shop.id, req.shop.tier),
    req.user.role === "owner" ? getShopSubscription(req.shop.id) : null,
  ]);
  res.send({ announcements, subscription });
});

module.exports = { GetStorageStatus, GetNotices };
