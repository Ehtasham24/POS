const express = require("express");
const routes = express.Router();
const { Search } = require("../../Controller/searchController");

routes.get("/api/search", Search);

module.exports = routes;
