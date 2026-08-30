const asyncHandler = require("../utils/asyncHandler");
const {
  listShops,
  createShop,
  updateShopDetails,
  updateShopTier,
  setShopActive,
  changeSuperAdminPassword,
  getUsageByShop,
} = require("../Sevices/adminService");
const {
  getTotalDbCapacityBytes,
  setTotalDbCapacityBytes,
  SUPABASE_TIER_PRESETS,
} = require("../Sevices/platformSettingsService");

const ListShops = asyncHandler(async (req, res) => {
  res.send(await listShops());
});

const CreateShop = asyncHandler(async (req, res) => {
  const { name, tier, ownerUsername, ownerPassword, ownerDisplayName, maxUsers } = req.body;
  const result = await createShop({ name, tier, ownerUsername, ownerPassword, ownerDisplayName, maxUsers });
  res.status(201).send(result);
});

const UpdateShopDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // storageQuotaPercent: undefined (key omitted) means "leave it alone"; null means "clear
  // the quota back to unlimited" — both are meaningfully different from a caller's request
  // body, and destructuring preserves that distinction (JSON.parse keeps an explicit null
  // as null, not undefined).
  const { name, maxUsers, storageQuotaPercent } = req.body;
  res.send(await updateShopDetails(id, { name, maxUsers, storageQuotaPercent }));
});

const UpdateShopTier = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tier } = req.body;
  res.send(await updateShopTier(id, tier));
});

const SetShopActive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;
  res.send(await setShopActive(id, isActive));
});

const ChangePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await changeSuperAdminPassword(req.user.id, { currentPassword, newPassword });
  res.status(204).send();
});

const GetUsage = asyncHandler(async (req, res) => {
  res.send(await getUsageByShop());
});

// Supabase has no queryable "what plan are we on" answer from inside this app (that's
// account/billing-level, on Supabase's own side) — presets are just a convenience so the
// admin doesn't have to do byte math for a plan they already know the name of.
const GetPlatformSettings = asyncHandler(async (req, res) => {
  res.send({ totalDbCapacityBytes: await getTotalDbCapacityBytes(), presets: SUPABASE_TIER_PRESETS });
});

const UpdatePlatformSettings = asyncHandler(async (req, res) => {
  const { totalDbCapacityBytes } = req.body;
  res.send({ totalDbCapacityBytes: await setTotalDbCapacityBytes(totalDbCapacityBytes) });
});

module.exports = {
  ListShops,
  CreateShop,
  UpdateShopDetails,
  UpdateShopTier,
  SetShopActive,
  ChangePassword,
  GetUsage,
  GetPlatformSettings,
  UpdatePlatformSettings,
};
