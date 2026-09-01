const {
  listParties,
  getBalanceMap,
  getPartyTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  netOffParty,
} = require("../Sevices/partyLedgerService");
const asyncHandler = require("../utils/asyncHandler");

const getParties = asyncHandler(async (req, res) => {
  const { direction, page, pageSize } = req.query;
  const result = await listParties(
    direction,
    req.user.shopId,
    page ? parseInt(page, 10) : 1,
    pageSize ? parseInt(pageSize, 10) : 20
  );
  res.send(result);
});

const getBalances = asyncHandler(async (req, res) => {
  const { direction } = req.query;
  const result = await getBalanceMap(direction, req.user.shopId);
  res.send(result);
});

const getTransactions = asyncHandler(async (req, res) => {
  const { contactId } = req.params;
  const { direction, page, pageSize } = req.query;
  const result = await getPartyTransactions(
    contactId,
    direction,
    page ? parseInt(page, 10) : 1,
    pageSize ? parseInt(pageSize, 10) : 20,
    req.user.shopId
  );
  res.send(result);
});

const postTransaction = asyncHandler(async (req, res) => {
  const { contactId, direction, kind, amount, occurredOn, note, saleId, lotId } = req.body;
  const result = await addTransaction(
    { contactId, direction, kind, amount, occurredOn, note, saleId, lotId },
    req.user.shopId
  );
  res.status(201).json(result);
});

const putTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, occurredOn, note } = req.body;
  const result = await updateTransaction(id, { amount, occurredOn, note }, req.user.shopId);
  res.send(result);
});

const removeTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await deleteTransaction(id, req.user.shopId);
  res.send(result);
});

const postNetOff = asyncHandler(async (req, res) => {
  const { contactId, amount, occurredOn, note } = req.body;
  const result = await netOffParty(contactId, amount, occurredOn, note, req.user.shopId);
  res.status(201).json(result);
});

module.exports = {
  getParties,
  getBalances,
  getTransactions,
  postTransaction,
  putTransaction,
  removeTransaction,
  postNetOff,
};
