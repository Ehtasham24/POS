const express = require("express");
const routes = express.Router();
const {
  ListShops,
  CreateShop,
  UpdateShopDetails,
  UpdateShopTier,
  SetShopActive,
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

module.exports = routes;
