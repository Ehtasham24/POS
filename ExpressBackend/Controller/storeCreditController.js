const {
  getVoucherByCode,
  listActiveVouchers,
  getVoucherHistory,
} = require("../Sevices/storeCreditService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

// Any logged-in staff — checkout (Cashier-accessible) needs this while ringing up a sale,
// same access level as checkout itself.
const lookupVoucher = asyncHandler(async (req, res) => {
  const voucher = await getVoucherByCode(req.params.code);
  if (!voucher) throw new ApiError(404, "Invalid voucher code");
  res.send(voucher);
});

// Owner-only below — same reasoning/gating as Credit/Debit: the full voucher list and
// per-voucher history are a book-keeping view, not something a Cashier needs mid-sale.
const getVouchers = asyncHandler(async (req, res) => {
  const result = await listActiveVouchers();
  res.send(result);
});

const getHistory = asyncHandler(async (req, res) => {
  const { refundId } = req.params;
  const { page, pageSize } = req.query;
  const result = await getVoucherHistory(
    refundId,
    page ? parseInt(page, 10) : 1,
    pageSize ? parseInt(pageSize, 10) : 20
  );
  res.send(result);
});

module.exports = { lookupVoucher, getVouchers, getHistory };
