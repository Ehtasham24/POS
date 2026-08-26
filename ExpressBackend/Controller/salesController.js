const {
  getRecentSales,
  checkoutSale,
  fetchSales,
  fetchSalesByProfitLoss,
  fetchSalesTimeSeries,
  fetchPaymentMediumTotals,
  fetchBilledHistory,
  voidSale,
  refundSale,
} = require("../Sevices/salesService");
const asyncHandler = require("../utils/asyncHandler");

// Whole-cart checkout — see Sevices/salesService.js's checkoutSale (receipt numbers need
// one atomic transaction per checkout, not N independent inserts with no shared record of
// belonging together — the old per-item PostSales/updateSalesRecord path this replaced is
// gone; it never set sale_transactions/payment_method at all).
const CheckoutSales = asyncHandler(async (req, res) => {
  const { items, paymentMethod, voucherCode, storeCreditRedeemed } = req.body;
  const result = await checkoutSale(items, paymentMethod, req.user, req.user.shopId, { voucherCode, storeCreditRedeemed });

  res.status(200).json({
    status: 200,
    message: "Checkout completed successfully",
    data: result,
  });
});

const getRecentSale = asyncHandler(async (req, res) => {
  const sales = await getRecentSales(req.user.shopId);
  res.status(200).json({
    message: "Recent sales grouped by timestamp fetched successfully",
    data: sales,
  });
});

const getBilledHistory = asyncHandler(async (req, res) => {
  const { startDate, endDate, categoryId, page, pageSize, voidStatus, receiptNo, paymentMethod } = req.query;
  // A Cashier only ever sees their own sales from today — same route as Owner's full
  // history, just pre-filtered server-side (see salesService.js's fetchBilledHistory).
  const viewerFilter = req.user.role === "cashier" ? { soldBy: req.user.id } : null;
  const result = await fetchBilledHistory(
    startDate,
    endDate,
    categoryId,
    page ? parseInt(page, 10) : 1,
    pageSize ? parseInt(pageSize, 10) : 30,
    viewerFilter,
    voidStatus,
    receiptNo,
    paymentMethod,
    req.user.shopId
  );
  res.status(200).send(result);
});

const voidSaleController = asyncHandler(async (req, res) => {
  const voided = await voidSale(req.params.id, req.user, req.body?.reason);
  res.status(200).send(voided);
});

// Any logged-in staff, any sale, any day — deliberately no requireOwner / same-day-own-sale
// gate here (unlike void), per the confirmed design: refunds routinely happen well after the
// original sale, by whoever's on shift. refundSale itself enforces the refund-window/already-
// voided/remaining-quantity rules.
const refundSaleController = asyncHandler(async (req, res) => {
  const { quantity, refundAmount, refundMethod, condition, reason, contactId } = req.body;
  const result = await refundSale(
    req.params.id,
    { quantity, refundAmount, refundMethod, condition, reason, contactId },
    req.user
  );
  res.status(200).send(result);
});

const getSales = asyncHandler(async (req, res) => {
  const { startDate, endDate, paymentMethod } = req.body;
  const response = await fetchSales(startDate, endDate, paymentMethod, req.user.shopId);
  res.status(200).send(response);
});

const getSalesByProfitLoss = asyncHandler(async (req, res) => {
  const { startDate, endDate, type, paymentMethod } = req.body;

  if (!type || (type !== "profit" && type !== "loss")) {
    return res
      .status(400)
      .send({ error: 'Invalid type. Use "profit" or "loss".' });
  }

  const response = await fetchSalesByProfitLoss(startDate, endDate, type, paymentMethod, req.user.shopId);
  res.status(200).send(response);
});

const getSalesTimeSeries = asyncHandler(async (req, res) => {
  const { startDate, endDate, paymentMethod } = req.body;
  const response = await fetchSalesTimeSeries(startDate, endDate, paymentMethod, req.user.shopId);
  res.status(200).send(response);
});

const getPaymentMediumTotals = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;
  const response = await fetchPaymentMediumTotals(startDate, endDate, req.user.shopId);
  res.status(200).send(response);
});

module.exports = {
  CheckoutSales,
  getSales,
  getSalesByProfitLoss,
  getSalesTimeSeries,
  getPaymentMediumTotals,
  getRecentSale,
  getBilledHistory,
  voidSaleController,
  refundSaleController,
};
