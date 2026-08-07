const express = require("express");
const routes = express.Router();
const { GetInventory } = require("../../Controller/inventoryController");

routes.get("/api/inventory", GetInventory);

module.exports = routes;
