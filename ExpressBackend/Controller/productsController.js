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

const { GetItem } = require("./categoriesController");
const { getLotsForProduct, getLotByCode, createLot, addStockToLot } = require("../Sevices/lotService");

const GetLotByCode = async (req, res) => {
  const { code } = req.params;
  try {
    const lot = await getLotByCode(code.toUpperCase());
    if (!lot) {
      return res.status(404).send({ message: `No lot found with code: ${code}` });
    }
    res.send(lot);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Controller error" });
  }
};

const GetProductLots = async (req, res) => {
  const { id } = req.params;
  try {
    const lots = await getLotsForProduct(id);
    res.send(lots);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Controller error" });
  }
};

const PostProductLot = async (req, res) => {
  const { id } = req.params;
  const { vendor_id, buying_price, quantity } = req.body;
  try {
    const lot = await createLot(id, { vendor_id, buying_price, quantity });
    res.status(201).send(lot);
  } catch (err) {
    console.error(err);
    res.status(400).send({ message: err.message });
  }
};

const PatchLotAddStock = async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;
  try {
    const lot = await addStockToLot(id, quantity);
    res.send(lot);
  } catch (err) {
    console.error(err);
    res.status(400).send({ message: err.message });
  }
};

const GetItems = async (req, res) => {
  try {
    const result = await getItems();
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Controller error" });
    console.log(err);
  }
};
//TESTING PR FUNCTIONALITY CHERRY SPOT

const GetItemsById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await getItemById(id);
    res.send(result);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send({ message: "Controller error" });
  }
};

const GetItemsByName = async (req, res) => {
  const { name } = req.body;

  const nameLower = name.toLowerCase();

  try {
    const result = await getItemByName(nameLower);
    res.send(result);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send({ message: "Controller error" });
  }
};

const PostItems = async (req, res) => {
  const { name, buying_price, quantity, category_id, batch_tracked, vendor_id } = req.body;
  const nameLower = name.toLowerCase();

  console.log(req.body);
  try {
    const result = await postItems(
      nameLower,
      buying_price,
      quantity,
      category_id,
      { batch_tracked, vendor_id }
    );

    console.log("check", result);
    res.send({ product: result.rows[0], lot: result.lot });
  } catch (err) {
    if (
      err.message === "Cannot enter duplicate products!" ||
      err.message ===
        `duplicate key value violates unique constraint "unique_productname_lower"`
    ) {
      res.status(409).json({ error: "Duplicate product found" });
    } else {
      res.status(500).send({ message: err.message });
      console.log(err);
    }
    // res.status(500).send({ message: err.message });
    //console.log(err);
  }
};

const UpdateItems = async (req, res) => {
  const id = req.params.id;
  const { name, price, Quantity, Category_id } = req.body;
  const nameLower = name.toLowerCase();

  try {
    const result = await updateItems(
      nameLower,
      price,
      Quantity,
      Category_id,
      id
    );
    res.send({
      message: `Item with id: ${id} updated with name: ${nameLower} & price: ${price} and Quantity: ${Quantity} ${result}`,
    });
  } catch (err) {
    res.status(500).send({ message: "Controller error" });
    console.log(err);
  }
};

const DeleteItems = async (req, res) => {
  const id = req.params.id;
  try {
    const { name, deleteResult } = await deleteItemById(id);
    if (deleteResult.rowCount === 0) {
      res.send({ message: `No item with id: ${id} found` });
    } else {
      res.send({
        message: `Item with id: ${id} (${name}) deleted successfully`,
      });
    }
  } catch (err) {
    res.status(500).send({ message: `Controller error: ${err.message}` });
    console.log(err);
  }
};

const DeleteItemsByName = async (req, res) => {
  const { name } = req.body;

  const nameLower = name.toLowerCase();

  try {
    const result = await deleteItemsByName(nameLower);
    res.send({
      message: `Item with name: ${name} deleted successfully ${result.rows}`,
    });
  } catch (err) {
    console.error(err);
    if (err.message === `No item with name ${nameLower} found`) {
      res.status(409).json({ error: "No such product found" });
    } else {
      res.status(500).send({ message: "Controller error" });
    }
  }
};

const UpdateItemsByName = async (req, res) => {
  const { name, buying_price, quantity, category_id } = req.body;

  try {
    const nameLower = name.toLowerCase();

    const result = await updateItemByName(
      nameLower,
      buying_price,
      quantity,
      category_id
    );

    // Check if result is not empty
    if (result.length === 0) {
      return res.status(404).send({ message: "No items found to update" });
    }

    console.log("check update", result);
    console.log(result[0]); // Access the first row if it exists
    res.send({ message: "updated successfully", updatedItem: result[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: err.message });
  }
};

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
