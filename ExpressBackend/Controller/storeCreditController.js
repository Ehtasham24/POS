const {
  getBalance,
  listCustomersWithCredit,
  getCustomerHistory,
} = require("../Sevices/storeCreditService");
const asyncHandler = require("../utils/asyncHandler");

// Any logged-in staff — checkout (Cashier-accessible) needs to check a customer's balance
// while ringing up a sale, same access level as checkout itself.
const getCustomerBalance = asyncHandler(async (req, res) => {
  const { contactId } = req.params;
  const balance = await getBalance(contactId);
  res.send({ contactId: Number(contactId), balance });
});

// Owner-only below — same reasoning/gating as Credit/Debit (partyLedgerRoutes.js): the full
// customer list and per-customer history are a book-keeping view, not something a Cashier
// needs mid-sale.
const getCustomers = asyncHandler(async (req, res) => {
  const result = await listCustomersWithCredit();
  res.send(result);
});

const getTransactions = asyncHandler(async (req, res) => {
  const { contactId } = req.params;
  const { page, pageSize } = req.query;
  const result = await getCustomerHistory(
    contactId,
    page ? parseInt(page, 10) : 1,
    pageSize ? parseInt(pageSize, 10) : 20
  );
  res.send(result);
});

module.exports = { getCustomerBalance, getCustomers, getTransactions };
