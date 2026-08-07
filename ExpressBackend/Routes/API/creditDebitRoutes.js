const express = require("express");
const routes = express.Router();
const {
  getAllRecords,
  getCreditByname,
  updateCreditByname,
  updateCreditByIdController,
  deleteCreditByname,
  postCredit,
  settleCreditController,
  getDebitByname,
  postDebit,
  updateDebitByname,
  updateDebitByIdController,
  deleteDebitByname,
  settleDebitController,
} = require("../../Controller/creditDebitController");

routes.get("/creditsDebits", getAllRecords);
routes.post("/credit/getByName", getCreditByname);
routes.post("/credit", postCredit);
routes.put("/credit", updateCreditByname);
routes.put("/api/credit/:id", updateCreditByIdController);
routes.delete("/credit", deleteCreditByname);
routes.patch("/credit/:id/settle", settleCreditController);
routes.post("/debit/getByName", getDebitByname);
routes.post("/debit", postDebit);
routes.put("/debit", updateDebitByname);
routes.put("/api/debit/:id", updateDebitByIdController);
routes.delete("/debit", deleteDebitByname);
routes.patch("/debit/:id/settle", settleDebitController);

module.exports = routes;
