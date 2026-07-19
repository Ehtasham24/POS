const {
  fetchAllRecords,
  fetchCreditByName,
  insertCredit,
  updateCreditByName,
  deleteCreditByName,
  settleCredit,
  fetchDebitByName,
  insertDebit,
  updateDebitByName,
  deleteDebitByName,
  settleDebit,
} = require("../Sevices/creditDebitServies");

const getAllRecords = async (req, res) => {
  try {
    const result = await fetchAllRecords();
    res.send(result);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};

const getCreditByname = async (req, res) => {
  const { name } = req.body;
  try {
    const result = await fetchCreditByName(name);
    res.send(result.rows);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};

const postCredit = async (req, res) => {
  const { name, amount_due, amount_received } = req.body;
  try {
    const result = await insertCredit(name, amount_due, amount_received);
    res.send(`new entry inserted ${result.rows}`);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};

const updateCreditByname = async (req, res) => {
  const { name, amountdue, amountrecieved, total_amount } = req.body;
  try {
    const result = await updateCreditByName(
      name,
      amountdue,
      amountrecieved,
      total_amount
    );
    res.send(`entry updated ${result.rows}`);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};

const deleteCreditByname = async (req, res) => {
  const { name } = req.body;
  try {
    const result = await deleteCreditByName(name);
    res.send(`Item with name${name} deleted ${result.rows}`);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};

const settleCreditController = async (req, res) => {
  const { id } = req.params;
  const { amountPaid } = req.body;
  try {
    const result = await settleCredit(id, amountPaid);
    res.send(result.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};

const getDebitByname = async (req, res) => {
  const { name } = req.body;
  try {
    const result = await fetchDebitByName(name);
    res.send(result.rows);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};

const postDebit = async (req, res) => {
  const { name, amount_due, amount_received } = req.body;
  try {
    const result = await insertDebit(name, amount_due, amount_received);
    res.send(`New entry inserted: ${result.rows}`);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};

const updateDebitByname = async (req, res) => {
  const { name, amount_due, amount_received, total_amount } = req.body;
  try {
    const result = await updateDebitByName(
      name,
      amount_due,
      amount_received,
      total_amount
    );
    res.send(`Entry updated: ${result.rows}`);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};

const deleteDebitByname = async (req, res) => {
  const { name } = req.body;
  try {
    const result = await deleteDebitByName(name);
    res.send(`Item with name ${name} deleted: ${result.rows}`);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};

const settleDebitController = async (req, res) => {
  const { id } = req.params;
  const { amountPaid } = req.body;
  try {
    const result = await settleDebit(id, amountPaid);
    res.send(result.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(400).send(err);
  }
};

module.exports = {
  getAllRecords,
  getCreditByname,
  postCredit,
  updateCreditByname,
  deleteCreditByname,
  settleCreditController,
  getDebitByname,
  postDebit,
  updateDebitByname,
  deleteDebitByname,
  settleDebitController,
};
