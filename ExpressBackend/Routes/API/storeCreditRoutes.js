const express = require("express");
const routes = express.Router();
const { getCustomerBalance, getCustomers, getTransactions } = require("../../Controller/storeCreditController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");

// Applied per-route (see usersRoutes.js's comment for why routes.use(...) here would have
// been wrong). Balance lookup is any logged-in staff (checkout needs it); the full
// customer list/history is Owner-only, mirroring Credit/Debit's gating.
routes.get("/api/store-credit/:contactId/balance", requireAuth, getCustomerBalance);
routes.get("/api/store-credit", requireAuth, requireOwner, getCustomers);
routes.get("/api/store-credit/:contactId/transactions", requireAuth, requireOwner, getTransactions);

module.exports = routes;
