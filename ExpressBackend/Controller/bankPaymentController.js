const {
  createIntent,
  getIntent,
  listIntents,
  confirmIntent,
  cancelIntent,
  requeueIntent,
} = require("../Sevices/bankPaymentService");
const asyncHandler = require("../utils/asyncHandler");

const CreateBankPaymentIntent = asyncHandler(async (req, res) => {
  const { items, voucherCode, storeCreditRedeemed } = req.body;
  const intent = await createIntent(items, req.user, { voucherCode, storeCreditRedeemed });
  res.status(201).send(intent);
});

const GetBankPaymentIntent = asyncHandler(async (req, res) => {
  const intent = await getIntent(req.params.id);
  res.send(intent);
});

const ListBankPaymentIntents = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const intents = await listIntents({ status });
  res.send(intents);
});

const ConfirmBankPaymentIntent = asyncHandler(async (req, res) => {
  const intent = await confirmIntent(req.params.id, { requestingUser: req.user });
  res.send(intent);
});

const CancelBankPaymentIntent = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const intent = await cancelIntent(req.params.id, req.user, reason);
  res.send(intent);
});

const RequeueBankPaymentIntent = asyncHandler(async (req, res) => {
  const intent = await requeueIntent(req.params.id, req.user);
  res.send(intent);
});

module.exports = {
  CreateBankPaymentIntent,
  GetBankPaymentIntent,
  ListBankPaymentIntents,
  ConfirmBankPaymentIntent,
  CancelBankPaymentIntent,
  RequeueBankPaymentIntent,
};
