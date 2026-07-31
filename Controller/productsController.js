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

const GetItems = async (req, res) => {
  try {
    const result = await getItems();
    res.send(result.rows);
  } catch (err) {
    res.status(500).send({ message: "Controller error" });
    console.log(err);
  }
};
// PR test ok

const GetItemsById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await getItemById(id);
    res.send(result.rows);
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
    res.send(result.rows);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send({ message: "Controller error" });
  }
};

const PostItems = async (req, res) => {
  const { name, buying_price, quantity, category_id } = req.body;
  const nameLower = name.toLowerCase();

  console.log(req.body);
  try {
    const result = await postItems(
      nameLower,
      buying_price,
      quantity,
      category_id
    );

    console.log("check", result);
    res.send(result.rows);
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
    console.log("check update", result);
    console.log(result.rows[0]);
    res.send({ message: "updated successfully" });
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
};
