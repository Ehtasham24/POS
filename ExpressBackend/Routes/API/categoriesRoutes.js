const express = require("express");
const routes = express.Router();
const {
  GetCategories,
  GetProductsForCategories,
  PostCategory,
} = require("../../Controller/categoriesController");

routes.get("/categories", GetCategories);
routes.get("/categories/:id", GetProductsForCategories);
routes.post("/categories", PostCategory);

module.exports = routes;
