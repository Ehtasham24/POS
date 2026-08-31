const express = require("express");
const routes = express.Router();
const {
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
} = require("../../Controller/adminController");
const requireAuth = require("../../Middleware/requireAuth");
const requireSuperAdmin = require("../../Middleware/requireSuperAdmin");

// Every route here is platform-level, not shop-level — requireSuperAdmin (not requireOwner)
// on all of them. This is deliberately the ONLY place shops.tier is ever written outside a
// migration; updateShopTier (Sevices/adminService.js) is what finally calls the Phase 6
// downgrade automations that were built standalone with no trigger wired to them yet.
routes.get("/api/admin/shops", requireAuth, requireSuperAdmin, ListShops);
routes.post("/api/admin/shops", requireAuth, requireSuperAdmin, CreateShop);
// Plain field edits (name, max_users) — kept separate from /tier, which has real side
// effects (downgrade automations) this one deliberately doesn't.
routes.patch("/api/admin/shops/:id", requireAuth, requireSuperAdmin, UpdateShopDetails);
routes.patch("/api/admin/shops/:id/tier", requireAuth, requireSuperAdmin, UpdateShopTier);
routes.patch("/api/admin/shops/:id/active", requireAuth, requireSuperAdmin, SetShopActive);
// req.user.id, not a param — a superadmin can only ever change their OWN password here,
// never another admin's (there's no multi-admin management yet — see the recommendations
// this shipped alongside).
routes.patch("/api/admin/me/password", requireAuth, requireSuperAdmin, ChangePassword);
routes.get("/api/admin/usage", requireAuth, requireSuperAdmin, GetUsage);
routes.get("/api/admin/shops/:id/egress-series", requireAuth, requireSuperAdmin, GetShopEgressSeries);
// The one platform-wide (not per-shop) setting so far — how big the actual database is
// allowed to get, per the real Supabase plan. Every shop's quota percentage (above) is
// only ever meaningful relative to this.
routes.get("/api/admin/platform-settings", requireAuth, requireSuperAdmin, GetPlatformSettings);
routes.patch("/api/admin/platform-settings", requireAuth, requireSuperAdmin, UpdatePlatformSettings);
// A standalone "what quota should I give this shop" calculator, checked BEFORE a shop is
// created — not wired into CreateShop/UpdateShopDetails themselves, since the admin reads
// the recommendation here and types the resulting % into those forms manually.
routes.post("/api/admin/storage-estimate", requireAuth, requireSuperAdmin, EstimateStorage);
// Owner Profile — a shop's owner identity (name/email/phone/CNIC), separate from
// UpdateShopDetails since it edits a `users` row, not `shops`. username/password
// deliberately excluded — see adminService.js's updateShopOwner comment.
routes.get("/api/admin/shops/:id/owner", requireAuth, requireSuperAdmin, GetShopOwner);
routes.patch("/api/admin/shops/:id/owner", requireAuth, requireSuperAdmin, UpdateShopOwner);
// Forgot-password requests — a shop user submits one (POST /api/auth/forgot-password,
// public), a superadmin reviews/approves/rejects it here.
routes.get("/api/admin/password-reset-requests", requireAuth, requireSuperAdmin, ListPasswordResetRequests);
routes.patch(
  "/api/admin/password-reset-requests/:id/approve",
  requireAuth,
  requireSuperAdmin,
  ApprovePasswordResetRequest
);
routes.patch(
  "/api/admin/password-reset-requests/:id/reject",
  requireAuth,
  requireSuperAdmin,
  RejectPasswordResetRequest
);

module.exports = routes;
