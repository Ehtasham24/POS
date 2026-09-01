const express = require("express");
const routes = express.Router();
const {
  getParties,
  getBalances,
  getTransactions,
  postTransaction,
  putTransaction,
  removeTransaction,
  postNetOff,
} = require("../../Controller/partyLedgerController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");
const requireFeature = require("../../Middleware/requireFeature");

// Applied per-route (see usersRoutes.js's comment for why routes.use(...) here would
// have been wrong). Credit/Debit is Owner-only in full — a Cashier has no access to any
// route in this file. Smart-tier+.
routes.get("/api/parties", requireAuth, requireOwner, requireFeature("partyLedger"), getParties);
// Unbounded contact_id->balance map for one direction — LedgerTable's cross-direction
// "Net Off" lookup, kept independent of listParties' pagination (see partyLedgerService.js).
routes.get("/api/parties/balances", requireAuth, requireOwner, requireFeature("partyLedger"), getBalances);
routes.get("/api/parties/:contactId/transactions", requireAuth, requireOwner, requireFeature("partyLedger"), getTransactions);
routes.post("/api/parties/transactions", requireAuth, requireOwner, requireFeature("partyLedger"), postTransaction);
routes.put("/api/parties/transactions/:id", requireAuth, requireOwner, requireFeature("partyLedger"), putTransaction);
routes.delete("/api/parties/transactions/:id", requireAuth, requireOwner, requireFeature("partyLedger"), removeTransaction);
routes.post("/api/parties/net-off", requireAuth, requireOwner, requireFeature("partyLedger"), postNetOff);

module.exports = routes;
