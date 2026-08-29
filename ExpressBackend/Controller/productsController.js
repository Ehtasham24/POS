const {
  getItems,
  getItemById,
  getItemByName,
  postItems,
  updateItems,
  updateItemByName,
  deleteItemById,
  deleteItemsByName,
} = require("../Sevices/productsService");

const { getLotsForProduct, getLotByCode, createLot, addStockToLot } = require("../Sevices/lotService");
const asyncHandler = require("../utils/asyncHandler");

const GetLotByCode = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const lot = await getLotByCode(code.toUpperCase(), req.user.shopId);
  if (!lot) {
    return res.status(404).send({ message: `No lot found with code: ${code}` });
  }
  res.send(lot);
});

const GetProductLots = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const lots = await getLotsForProduct(id, req.user.shopId);
  res.send(lots);
});

const PostProductLot = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { vendor_id, buying_price, quantity } = req.body;
  const lot = await createLot(id, { vendor_id, buying_price, quantity }, req.user.id, req.user.shopId);
  res.status(201).send(lot);
});

const PatchLotAddStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;
  const lot = await addStockToLot(id, quantity, req.user.shopId);
  res.send(lot);
});

const GetItems = asyncHandler(async (req, res) => {
  const result = await getItems(req.user.shopId);
  res.send(result);
});

const GetItemsById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await getItemById(id, req.user.shopId);
  res.send(result);
});

const GetItemsByName = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const nameLower = name.toLowerCase();
  const result = await getItemByName(nameLower, req.user.shopId);
  res.send(result);
});

const PostItems = asyncHandler(async (req, res) => {
  const { name, buying_price, quantity, category_id, batch_tracked, vendor_id } = req.body;
  const nameLower = name.toLowerCase();

  const result = await postItems(
    nameLower,
    buying_price,
    quantity,
    category_id,
    { batch_tracked, vendor_id, receivedByUserId: req.user.id },
    req.user.shopId
  );
  res.send({ product: result.rows[0], lot: result.lot });
});

const UpdateItems = asyncHandler(async (req, res) => {
  const id = req.params.id;
  // Quantity is only honored when the caller sends one AND the shop's tier still allows
  // manual edits (manualQuantityEdit, Basic-only) AND the product isn't batch-tracked —
  // all enforced server-side in productsService.js, never trusted from here. Smart/Advanced
  // shops (and any batch-tracked product, on every tier) always go through Stock Adjustment
  // instead; anything sent that doesn't qualify is silently ignored, not rejected.
  const { name, price, Category_id, Quantity } = req.body;
  const nameLower = name.toLowerCase();

  const result = await updateItems(nameLower, price, Category_id, id, req.user.shopId, {
    quantity: Quantity,
    shopTier: req.user.shopTier,
  });
  res.send({
    message: `Item with id: ${id} updated with name: ${nameLower} & price: ${price}`,
  });
});

const DeleteItems = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { name, deleteResult } = await deleteItemById(id, req.user.shopId);
  if (deleteResult.rowCount === 0) {
    res.send({ message: `No item with id: ${id} found` });
  } else {
    res.send({
      message: `Item with id: ${id} (${name}) deleted successfully`,
    });
  }
});

const DeleteItemsByName = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const nameLower = name.toLowerCase();

  const result = await deleteItemsByName(nameLower, req.user.shopId);
  res.send({
    message: `Item with name: ${name} deleted successfully ${result.rows}`,
  });
});

const UpdateItemsByName = asyncHandler(async (req, res) => {
  const { name, buying_price, quantity, category_id } = req.body;
  const nameLower = name.toLowerCase();

  // Same manualQuantityEdit + non-batch gate as UpdateItems above — see
  // productsService.js's updateItemByName comment.
  const result = await updateItemByName(
    nameLower,
    buying_price,
    quantity,
    category_id,
    req.user.shopId,
    req.user.shopTier
  );

  res.send({ message: "updated successfully", updatedItem: result[0] });
});

module.exports = {
  PostItems,
  UpdateItems,
  DeleteItems,
  GetItems,
  GetItemsByName,
  GetItemsById,
  UpdateItemsByName,
  DeleteItemsByName,
  GetLotByCode,
  GetProductLots,
  PostProductLot,
  PatchLotAddStock,
};
