const {
  fetchAllRecords,
  fetchCreditByName,
  insertCredit,
  updateCreditByName,
  updateCreditById,
  deleteCreditByName,
  settleCredit,
  fetchDebitByName,
  insertDebit,
  updateDebitByName,
  updateDebitById,
  deleteDebitByName,
  settleDebit,
} = require("../Sevices/creditDebitServies");
const asyncHandler = require("../utils/asyncHandler");

const getAllRecords = asyncHandler(async (req, res) => {
  const result = await fetchAllRecords();
  res.send(result);
});

const getCreditByname = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const result = await fetchCreditByName(name);
  res.send(result.rows);
});

const postCredit = asyncHandler(async (req, res) => {
  const { name, amount_due, amount_received, contact_id } = req.body;
  const result = await insertCredit(name, amount_due, amount_received, contact_id);
  res.status(201).json(result.rows[0]);
});

const updateCreditByname = asyncHandler(async (req, res) => {
  const { name, amountdue, amountrecieved, total_amount } = req.body;
  const result = await updateCreditByName(
    name,
    amountdue,
    amountrecieved,
    total_amount
  );
  res.json(result.rows[0]);
});

const deleteCreditByname = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const result = await deleteCreditByName(name);
  res.json({ message: `Item with name ${name} deleted`, deleted: result.rows });
});

const updateCreditByIdController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { contact_id, amount_due, amount_received } = req.body;
  const result = await updateCreditById(id, contact_id, amount_due, amount_received);
  res.send(result.rows[0]);
});

const settleCreditController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amountPaid } = req.body;
  const result = await settleCredit(id, amountPaid);
  res.send(result.rows[0]);
});

const getDebitByname = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const result = await fetchDebitByName(name);
  res.send(result.rows);
});

const postDebit = asyncHandler(async (req, res) => {
  const { name, amount_due, amount_received, contact_id } = req.body;
  const result = await insertDebit(name, amount_due, amount_received, contact_id);
  res.status(201).json(result.rows[0]);
});

const updateDebitByname = asyncHandler(async (req, res) => {
  const { name, amount_due, amount_received, total_amount } = req.body;
  const result = await updateDebitByName(
    name,
    amount_due,
    amount_received,
    total_amount
  );
  res.json(result.rows[0]);
});

const deleteDebitByname = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const result = await deleteDebitByName(name);
  res.json({ message: `Item with name ${name} deleted`, deleted: result.rows });
});

const updateDebitByIdController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { contact_id, amount_due, amount_received } = req.body;
  const result = await updateDebitById(id, contact_id, amount_due, amount_received);
  res.send(result.rows[0]);
});

const settleDebitController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amountPaid } = req.body;
  const result = await settleDebit(id, amountPaid);
  res.send(result.rows[0]);
});

module.exports = {
  getAllRecords,
  getCreditByname,
  postCredit,
  updateCreditByname,
  updateCreditByIdController,
  deleteCreditByname,
  settleCreditController,
  getDebitByname,
  postDebit,
  updateDebitByname,
  updateDebitByIdController,
  deleteDebitByname,
  settleDebitController,
};
