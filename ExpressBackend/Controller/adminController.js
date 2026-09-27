const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
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
  getPlatformOverview,
  getPlatformHealth,
  getShopDetail,
  setShopUserActive,
  resetShopUserPassword,
} = require("../Sevices/adminService");
const {
  getTotalDbCapacityBytes,
  setTotalDbCapacityBytes,
  SUPABASE_TIER_PRESETS,
} = require("../Sevices/platformSettingsService");
const { estimateShopStorage } = require("../Sevices/storageEstimatorService");
const { getDailyEgressSeries } = require("../Sevices/egressService");
const { listRequests, approveRequest, rejectRequest } = require("../Sevices/passwordResetService");
const { recordAudit, listAudit } = require("../Sevices/auditService");
const { listLoginEvents } = require("../Sevices/loginSecurityService");
const { recordPayment, deletePayment } = require("../Sevices/subscriptionService");
const { listAnnouncements, createAnnouncement, endAnnouncement } = require("../Sevices/announcementService");

// Every change made from the admin console is written to the audit trail
// (Sevices/auditService.js) once it has succeeded — `audit(req, action, ...)` below.
const audit = (req, action, shopId, details) => recordAudit(req.user.id, action, { shopId, details });
const idParam = (value) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, "Invalid id");
  return id;
};

const ListShops = asyncHandler(async (req, res) => {
  res.send(await listShops());
});

const CreateShop = asyncHandler(async (req, res) => {
  const { name, tier, ownerUsername, ownerPassword, ownerDisplayName, maxUsers } = req.body;
  const result = await createShop({ name, tier, ownerUsername, ownerPassword, ownerDisplayName, maxUsers });
  await audit(req, "shop.create", result.shop.id, { name: result.shop.name, tier, owner: result.owner.username });
  res.status(201).send(result);
});

const UpdateShopDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // storageQuotaPercent: undefined (key omitted) means "leave it alone"; null means "clear
  // the quota back to unlimited" — both are meaningfully different from a caller's request
  // body, and destructuring preserves that distinction (JSON.parse keeps an explicit null
  // as null, not undefined).
  const { name, maxUsers, storageQuotaPercent } = req.body;
  const shop = await updateShopDetails(id, { name, maxUsers, storageQuotaPercent });
  await audit(req, "shop.update", shop.id, { name, maxUsers, storageQuotaPercent });
  res.send(shop);
});

const UpdateShopTier = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tier } = req.body;
  const result = await updateShopTier(id, tier);
  await audit(req, "shop.tier", result.shop.id, { from: result.previousTier, to: tier, ...result.automations });
  res.send(result);
});

const SetShopActive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;
  const shop = await setShopActive(id, isActive);
  await audit(req, shop.is_active ? "shop.activate" : "shop.deactivate", shop.id);
  res.send(shop);
});

const ChangePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await changeSuperAdminPassword(req.user.id, { currentPassword, newPassword });
  await audit(req, "admin.password", null);
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
  const saved = await setTotalDbCapacityBytes(totalDbCapacityBytes);
  await audit(req, "platform.capacity", null, { totalDbCapacityBytes: saved });
  res.send({ totalDbCapacityBytes: saved });
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
  const owner = await updateShopOwner(id, { displayName, email, phone, cnic });
  await audit(req, "shop.owner_profile", idParam(id), { user: owner.username });
  res.send(owner);
});

const ListPasswordResetRequests = asyncHandler(async (req, res) => {
  res.send(await listRequests(req.query.status));
});

const ApprovePasswordResetRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await approveRequest(id, req.user);
  await audit(req, "password_reset.approve", null, { user: result.username });
  res.send(result);
});

const RejectPasswordResetRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  await rejectRequest(id, req.user, notes);
  await audit(req, "password_reset.reject", null, { requestId: idParam(id), notes: notes || null });
  res.status(204).send();
});

const GetOverview = asyncHandler(async (req, res) => {
  res.send(await getPlatformOverview());
});

const GetHealth = asyncHandler(async (req, res) => {
  res.send(await getPlatformHealth());
});

const GetShopDetail = asyncHandler(async (req, res) => {
  res.send(await getShopDetail(idParam(req.params.id)));
});

const SetShopUserActive = asyncHandler(async (req, res) => {
  const shopId = idParam(req.params.id);
  const user = await setShopUserActive(shopId, idParam(req.params.userId), req.body.isActive);
  await audit(req, user.is_active ? "user.activate" : "user.deactivate", shopId, { user: user.username });
  res.send(user);
});

// The temp password is in this one response only — never stored, never in the audit trail.
const ResetShopUserPassword = asyncHandler(async (req, res) => {
  const shopId = idParam(req.params.id);
  const result = await resetShopUserPassword(shopId, idParam(req.params.userId));
  await audit(req, "user.password_reset", shopId, { user: result.username });
  res.send(result);
});

const RecordShopPayment = asyncHandler(async (req, res) => {
  const shopId = idParam(req.params.id);
  const { amount, method, months, coversFrom, reference, note } = req.body;
  const payment = await recordPayment(shopId, { amount, method, months, coversFrom, reference, note }, req.user.id);
  await audit(req, "billing.payment", shopId, {
    amount: payment.amount,
    method: payment.method,
    coversFrom: payment.covers_from,
    coversUntil: payment.covers_until,
  });
  res.status(201).send(payment);
});

const DeleteShopPayment = asyncHandler(async (req, res) => {
  const shopId = idParam(req.params.id);
  const payment = await deletePayment(shopId, idParam(req.params.paymentId));
  await audit(req, "billing.payment_delete", shopId, {
    amount: payment.amount,
    method: payment.method,
    coversFrom: payment.covers_from,
    coversUntil: payment.covers_until,
  });
  res.status(204).send();
});

const ListAuditLog = asyncHandler(async (req, res) => {
  const { shopId, action, page, pageSize } = req.query;
  res.send(await listAudit({ shopId, action, page, pageSize }));
});

const ListLoginEvents = asyncHandler(async (req, res) => {
  const { outcome, shopId, username, page, pageSize } = req.query;
  res.send(await listLoginEvents({ outcome, shopId, username, page, pageSize }));
});

const ListAnnouncements = asyncHandler(async (req, res) => {
  res.send(await listAnnouncements());
});

const CreateAnnouncement = asyncHandler(async (req, res) => {
  const { title, body, level, shopId, tier, startsAt, endsAt } = req.body;
  const announcement = await createAnnouncement({ title, body, level, shopId, tier, startsAt, endsAt }, req.user.id);
  await audit(req, "announcement.create", announcement.shop_id, {
    title: announcement.title,
    level: announcement.level,
    tier: announcement.tier,
  });
  res.status(201).send(announcement);
});

const EndAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await endAnnouncement(idParam(req.params.id));
  await audit(req, "announcement.end", null, { title: announcement.title });
  res.send(announcement);
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
  GetOverview,
  GetHealth,
  GetShopDetail,
  SetShopUserActive,
  ResetShopUserPassword,
  RecordShopPayment,
  DeleteShopPayment,
  ListAuditLog,
  ListLoginEvents,
  ListAnnouncements,
  CreateAnnouncement,
  EndAnnouncement,
};
