const asyncHandler = require("../utils/asyncHandler");
const {
  listShops,
  createShop,
  updateShopDetails,
  updateShopTier,
  setShopActive,
} = require("../Sevices/adminService");

const ListShops = asyncHandler(async (req, res) => {
  res.send(await listShops());
});

const CreateShop = asyncHandler(async (req, res) => {
  const { name, tier, ownerUsername, ownerPassword, ownerDisplayName, maxUsers } = req.body;
  const result = await createShop({ name, tier, ownerUsername, ownerPassword, ownerDisplayName, maxUsers });
  res.status(201).send(result);
});

const UpdateShopDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, maxUsers } = req.body;
  res.send(await updateShopDetails(id, { name, maxUsers }));
});

const UpdateShopTier = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tier } = req.body;
  res.send(await updateShopTier(id, tier));
});

const SetShopActive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;
  res.send(await setShopActive(id, isActive));
});

module.exports = { ListShops, CreateShop, UpdateShopDetails, UpdateShopTier, SetShopActive };
