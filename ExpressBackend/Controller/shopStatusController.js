const asyncHandler = require("../utils/asyncHandler");
const { getShopStorageStatus } = require("../Sevices/storageQuotaService");

// req.shop is set by requireAuth for every shop-bound role (owner/cashier); a superadmin
// has none (migration 022) and was never meant to reach this route in the first place — no
// shop's own header renders for that role — so this just returns "nothing to report"
// rather than erroring if it's ever called that way.
const GetStorageStatus = asyncHandler(async (req, res) => {
  if (!req.shop) {
    return res.send({ usedBytes: 0, quotaBytes: null, quotaPercent: null, percentUsed: null, isNearLimit: false });
  }
  res.send(await getShopStorageStatus(req.shop.id));
});

module.exports = { GetStorageStatus };
