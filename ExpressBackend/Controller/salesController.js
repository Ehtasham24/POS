const {
  getRecentSales,
  updateSalesRecord,
  fetchSales,
  fetchSalesByProfitLoss,
  fetchSalesTimeSeries,
  fetchBilledHistory,
  voidSale,
} = require("../Sevices/salesService");
const asyncHandler = require("../utils/asyncHandler");

const PostSales = asyncHandler(async (req, res) => {
  const { sellingPrice, quantity, productID, lotId } = req.body;
  const { messageSend, updatedQuantity, saleId } = await updateSalesRecord(
    sellingPrice,
    quantity,
    productID,
    lotId,
    req.user.id
  );

  res.status(200).json({
    status: 200,
    message: "Sales data received successfully",
    data: { messageSend, updatedQuantity, saleId },
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
  // A Cashier only ever sees their own sales from today — same route as Owner's full
  // history, just pre-filtered server-side (see salesService.js's fetchBilledHistory).
  const viewerFilter = req.user.role === "cashier" ? { soldBy: req.user.id } : null;
  const result = await fetchBilledHistory(
    startDate,
    endDate,
    categoryId,
    page ? parseInt(page, 10) : 1,
    pageSize ? parseInt(pageSize, 10) : 30,
    viewerFilter
  );
  res.status(200).send(result);
});

const voidSaleController = asyncHandler(async (req, res) => {
  const voided = await voidSale(req.params.id, req.user, req.body?.reason);
  res.status(200).send(voided);
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
  voidSaleController,
};
