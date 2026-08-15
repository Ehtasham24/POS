const express = require("express");
const routes = express.Router();
const {
  getParties,
  getTransactions,
  postTransaction,
  putTransaction,
  removeTransaction,
  postNetOff,
} = require("../../Controller/partyLedgerController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");

// Applied per-route (see usersRoutes.js's comment for why routes.use(...) here would
// have been wrong). Credit/Debit is Owner-only in full — a Cashier has no access to any
// route in this file.
routes.get("/api/parties", requireAuth, requireOwner, getParties);
routes.get("/api/parties/:contactId/transactions", requireAuth, requireOwner, getTransactions);
routes.post("/api/parties/transactions", requireAuth, requireOwner, postTransaction);
routes.put("/api/parties/transactions/:id", requireAuth, requireOwner, putTransaction);
routes.delete("/api/parties/transactions/:id", requireAuth, requireOwner, removeTransaction);
routes.post("/api/parties/net-off", requireAuth, requireOwner, postNetOff);

module.exports = routes;
