const express = require("express");
const routes = express.Router();
const {
  GetCategories,
  GetProductsForCategories,
  PostCategory,
} = require("../../Controller/categoriesController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");

// Applied per-route (see usersRoutes.js's comment for why routes.use(requireAuth) here
// would have been wrong). Reads are needed by the selling flow (Categories/Product
// List) — any logged-in user, Cashier included. Creating a category is inventory
// management — Owner only.
routes.get("/categories", requireAuth, GetCategories);
routes.get("/categories/:id", requireAuth, GetProductsForCategories);
routes.post("/categories", requireAuth, requireOwner, PostCategory);

module.exports = routes;
