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

routes.get("/products", GetItems);
routes.get("/product/:id", GetItemsById);
routes.get("/api/lots/by-code/:code", GetLotByCode);
routes.get("/api/products/:id/lots", GetProductLots);
routes.post("/api/products/:id/lots", PostProductLot);
routes.patch("/api/lots/:id/add-stock", PatchLotAddStock);
routes.post("/products", GetItemsByName);
routes.post("/product", PostItems);
routes.delete("/product/:id", DeleteItems);
routes.delete("/product", DeleteItemsByName);
routes.put("/products/:id", UpdateItems);
routes.put("/updateproducts", UpdateItemsByName);

// routes.get('/:tableId', GetItems);
// routes.post('/:tableId',GetItemsByName);
// routes.post('/:tableId', PostItems);
// routes.delete('/:tableId/:id', DeleteItems);
// routes.put('/:tableId/:id', UpdateItems);
// routes.put('/:tableId', UpdateItemsByName);

module.exports = routes;
