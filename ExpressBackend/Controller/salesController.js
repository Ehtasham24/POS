const {
  getRecentSales,
  updateSalesRecord,
  fetchSales,
  fetchSalesByProfitLoss,
  fetchBilledHistory,
} = require("../Sevices/salesService");

const PostSales = async (req, res) => {
  const { sellingPrice, quantity, productID } = req.body;
  const { messageSend, updatedQuantity } = await updateSalesRecord(
    sellingPrice,
    quantity,
    productID
  );

  try {
    res.status(200).json({
      status: 200,
      message: "Sales data received successfully",
      data: { messageSend, updatedQuantity },
    });
  } catch (err) {
    res.status(404).json({
      status: 404,
      message: err.message,
    });
  }
};

const getRecentSale = async (req, res) => {
  try {
    // Call the service function to fetch the recent sales at the exact same timestamp
    const sales = await getRecentSales();

    // Return the fetched sales records in the response
    return res.status(200).json({
      message: "Recent sales grouped by timestamp fetched successfully",
      data: sales,
    });
  } catch (error) {
    // Handle errors and return failure response
    return res.status(500).json({
      message: "An error occurred while fetching sales records",
      error: error.message,
    });
  }
};

const getBilledHistory = async (req, res) => {
  try {
    const result = await fetchBilledHistory();
    res.status(200).send(result);
  } catch (err) {
    console.log(err);
    res.status(500).send({ message: err.message });
  }
};

const getSales = async (req, res) => {
  const { startDate, endDate } = req.body;
  const response = await fetchSales(startDate, endDate);
  try {
    res.status(200).send(response);
  } catch (err) {
    response.send({ error: err });
  }
};

const getSalesByProfitLoss = async (req, res) => {
  const { startDate, endDate, type } = req.body;

  if (!type || (type !== "profit" && type !== "loss")) {
    return res
      .status(400)
      .send({ error: 'Invalid type. Use "profit" or "loss".' });
  }

  try {
    const response = await fetchSalesByProfitLoss(startDate, endDate, type);
    res.status(200).send(response);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
};

module.exports = {
  PostSales,
  getSales,
  getSalesByProfitLoss,
  getRecentSale,
  getBilledHistory,
};
