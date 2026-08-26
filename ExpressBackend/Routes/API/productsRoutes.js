const express = require("express");
const routes = express.Router();
const {
  GetItems,
  GetItemsById,
  GetItemsByName,
  PostItems,
  UpdateItems,
  UpdateItemsByName,
  DeleteItems,
  DeleteItemsByName,
  GetLotByCode,
  GetProductLots,
  PostProductLot,
  PatchLotAddStock,
} = require("../../Controller/productsController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");
const requireFeature = require("../../Middleware/requireFeature");

// Applied per-route (see usersRoutes.js's comment for why routes.use(requireAuth) here
// would have been wrong). Reads (including the lot picker, used mid-sale for
// batch-tracked products) — any logged-in user. Everything that adds/edits/removes
// inventory — Owner only. Only the two routes that actually CREATE a lot/add lot stock are
// gated to lotTracking (Smart-tier+) — a Basic shop's core product reads/writes here stay
// ungated, same "gate the feature, not the file" reasoning as salesRoutes.js below.
routes.get("/products", requireAuth, GetItems);
routes.get("/product/:id", requireAuth, GetItemsById);
routes.get("/api/lots/by-code/:code", requireAuth, GetLotByCode);
routes.get("/api/products/:id/lots", requireAuth, GetProductLots);
routes.post("/products", requireAuth, GetItemsByName); // search-by-name, POST verb despite being a read
routes.post("/api/products/:id/lots", requireAuth, requireOwner, requireFeature("lotTracking"), PostProductLot);
routes.patch("/api/lots/:id/add-stock", requireAuth, requireOwner, requireFeature("lotTracking"), PatchLotAddStock);
routes.post("/product", requireAuth, requireOwner, PostItems);
routes.delete("/product/:id", requireAuth, requireOwner, DeleteItems);
routes.delete("/product", requireAuth, requireOwner, DeleteItemsByName);
routes.put("/products/:id", requireAuth, requireOwner, UpdateItems);
routes.put("/updateproducts", requireAuth, requireOwner, UpdateItemsByName);

// routes.get('/:tableId', GetItems);
// routes.post('/:tableId',GetItemsByName);
// routes.post('/:tableId', PostItems);
// routes.delete('/:tableId/:id', DeleteItems);
// routes.put('/:tableId/:id', UpdateItems);
// routes.put('/:tableId', UpdateItemsByName);

module.exports = routes;
