const { getInventory } = require("../Sevices/inventoryService");
const asyncHandler = require("../utils/asyncHandler");

const GetInventory = asyncHandler(async (req, res) => {
  const inventory = await getInventory(req.user.shopId);
  res.send(inventory);
});

module.exports = { GetInventory };
