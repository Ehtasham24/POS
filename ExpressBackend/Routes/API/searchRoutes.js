const express = require("express");
const routes = express.Router();
const { Search } = require("../../Controller/searchController");
const requireAuth = require("../../Middleware/requireAuth");

// The global search bar (AppShell header) is on every page, Cashier's selling screens
// included — any logged-in user.
routes.get("/api/search", requireAuth, Search);

module.exports = routes;
