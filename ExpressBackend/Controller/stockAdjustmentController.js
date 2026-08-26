const {
  createAdjustment,
  listAdjustments,
  getShrinkageSummary,
} = require("../Sevices/stockAdjustmentService");
const asyncHandler = require("../utils/asyncHandler");

const CreateStockAdjustment = asyncHandler(async (req, res) => {
  const { productId, lotId, quantityChange, reasonCode, note } = req.body;
  const adjustment = await createAdjustment(req.user, { productId, lotId, quantityChange, reasonCode, note });
  res.status(201).send(adjustment);
});

const ListStockAdjustments = asyncHandler(async (req, res) => {
  const { productId, startDate, endDate, reasonCode } = req.query;
  const adjustments = await listAdjustments({ productId, startDate, endDate, reasonCode }, req.user.shopId);
  res.send(adjustments);
});

const GetShrinkageSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const summary = await getShrinkageSummary(startDate, endDate, req.user.shopId);
  res.send(summary);
});

module.exports = { CreateStockAdjustment, ListStockAdjustments, GetShrinkageSummary };
