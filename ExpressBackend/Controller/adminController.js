const asyncHandler = require("../utils/asyncHandler");
const {
  listShops,
  createShop,
  updateShopDetails,
  getShopOwner,
  updateShopOwner,
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
const { estimateShopStorage } = require("../Sevices/storageEstimatorService");
const { getDailyEgressSeries } = require("../Sevices/egressService");
const { listRequests, approveRequest, rejectRequest } = require("../Sevices/passwordResetService");

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

// A pure calculation, no side effects — POST only because the input shape (five fields)
// is awkward as a query string, not because anything gets written.
const EstimateStorage = asyncHandler(async (req, res) => {
  const { numProducts, dailySalesLineItems, dailyStockAdjustments, numUsers, projectionMonths } = req.body;
  res.send(
    await estimateShopStorage({ numProducts, dailySalesLineItems, dailyStockAdjustments, numUsers, projectionMonths })
  );
});

// Real, per-day egress for one shop's detail view on the Usage page — a trend line, not
// just the 30-day total getUsageByShop already returns.
const GetShopEgressSeries = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const days = req.query.days ? Number(req.query.days) : 30;
  res.send({ series: await getDailyEgressSeries(id, days), days });
});

const GetShopOwner = asyncHandler(async (req, res) => {
  const { id } = req.params;
  res.send(await getShopOwner(id));
});

const UpdateShopOwner = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { displayName, email, phone, cnic } = req.body;
  res.send(await updateShopOwner(id, { displayName, email, phone, cnic }));
});

const ListPasswordResetRequests = asyncHandler(async (req, res) => {
  res.send(await listRequests(req.query.status));
});

const ApprovePasswordResetRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  res.send(await approveRequest(id, req.user));
});

const RejectPasswordResetRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  await rejectRequest(id, req.user, notes);
  res.status(204).send();
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
  EstimateStorage,
  GetShopEgressSeries,
  GetShopOwner,
  UpdateShopOwner,
  ListPasswordResetRequests,
  ApprovePasswordResetRequest,
  RejectPasswordResetRequest,
};
