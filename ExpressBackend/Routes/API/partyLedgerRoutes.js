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

routes.get("/api/parties", getParties);
routes.get("/api/parties/:contactId/transactions", getTransactions);
routes.post("/api/parties/transactions", postTransaction);
routes.put("/api/parties/transactions/:id", putTransaction);
routes.delete("/api/parties/transactions/:id", removeTransaction);
routes.post("/api/parties/net-off", postNetOff);

module.exports = routes;
