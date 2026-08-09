const {
  getRecentSales,
  updateSalesRecord,
  fetchSales,
  fetchSalesByProfitLoss,
  fetchSalesTimeSeries,
  fetchBilledHistory,
} = require("../Sevices/salesService");
const asyncHandler = require("../utils/asyncHandler");

const PostSales = asyncHandler(async (req, res) => {
  const { sellingPrice, quantity, productID, lotId } = req.body;
  const { messageSend, updatedQuantity } = await updateSalesRecord(
    sellingPrice,
    quantity,
    productID,
    lotId
  );

  res.status(200).json({
    status: 200,
    message: "Sales data received successfully",
    data: { messageSend, updatedQuantity },
  });
});

const getRecentSale = asyncHandler(async (req, res) => {
  const sales = await getRecentSales();
  res.status(200).json({
    message: "Recent sales grouped by timestamp fetched successfully",
    data: sales,
  });
});

const getBilledHistory = asyncHandler(async (req, res) => {
  const { startDate, endDate, categoryId, page, pageSize } = req.query;
  const result = await fetchBilledHistory(
    startDate,
    endDate,
    categoryId,
    page ? parseInt(page, 10) : 1,
    pageSize ? parseInt(pageSize, 10) : 30
  );
  res.status(200).send(result);
});

const getSales = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;
  const response = await fetchSales(startDate, endDate);
  res.status(200).send(response);
});

const getSalesByProfitLoss = asyncHandler(async (req, res) => {
  const { startDate, endDate, type } = req.body;

  if (!type || (type !== "profit" && type !== "loss")) {
    return res
      .status(400)
      .send({ error: 'Invalid type. Use "profit" or "loss".' });
  }

  const response = await fetchSalesByProfitLoss(startDate, endDate, type);
  res.status(200).send(response);
});

const getSalesTimeSeries = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;
  const response = await fetchSalesTimeSeries(startDate, endDate);
  res.status(200).send(response);
});

module.exports = {
  PostSales,
  getSales,
  getSalesByProfitLoss,
  getSalesTimeSeries,
  getRecentSale,
  getBilledHistory,
};
