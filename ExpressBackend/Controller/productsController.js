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
  // Quantity is deliberately not accepted here at all anymore — see productsService.js's
  // updateItems comment. Any Quantity a caller still sends (an old cached frontend build,
  // a direct API call) is simply ignored, not just rejected, so there's no error message to
  // keep in sync either.
  const { name, price, Category_id } = req.body;
  const nameLower = name.toLowerCase();

  const result = await updateItems(nameLower, price, Category_id, id, req.user.shopId);
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

  const result = await updateItemByName(
    nameLower,
    buying_price,
    quantity,
    category_id,
    req.user.shopId
  );

  if (result.length === 0) {
    return res.status(404).send({ message: "No items found to update" });
  }

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
