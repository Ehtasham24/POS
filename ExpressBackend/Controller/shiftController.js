const {
  getOpenShift,
  openShift,
  closeShift,
  recordCashMovement,
  listShifts,
  getShiftDetail,
  reconcileShift,
} = require("../Sevices/shiftService");
const asyncHandler = require("../utils/asyncHandler");

const OpenShift = asyncHandler(async (req, res) => {
  const { openingFloat } = req.body;
  const shift = await openShift(req.user, openingFloat);
  res.status(201).send(shift);
});

const GetCurrentShift = asyncHandler(async (req, res) => {
  const shift = await getOpenShift(req.user.id);
  res.send(shift);
});

const CloseShift = asyncHandler(async (req, res) => {
  const { countedCash, notes } = req.body;
  const shift = await closeShift(req.params.id, req.user, countedCash, notes);
  res.send(shift);
});

const RecordCashMovement = asyncHandler(async (req, res) => {
  const { amount, reason, contactId } = req.body;
  const movement = await recordCashMovement(req.params.id, req.user, amount, reason, contactId);
  res.status(201).send(movement);
});

const ListShifts = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const shifts = await listShifts(req.user, { status });
  res.send(shifts);
});

const GetShiftDetail = asyncHandler(async (req, res) => {
  const shift = await getShiftDetail(req.params.id, req.user);
  res.send(shift);
});

const ReconcileShift = asyncHandler(async (req, res) => {
  const { countedCash, notes } = req.body;
  const shift = await reconcileShift(req.params.id, req.user, countedCash, notes);
  res.send(shift);
});

module.exports = {
  OpenShift,
  GetCurrentShift,
  CloseShift,
  RecordCashMovement,
  ListShifts,
  GetShiftDetail,
  ReconcileShift,
};
