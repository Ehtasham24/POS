const { getInventory } = require("../Sevices/inventoryService");

const GetInventory = async (req, res) => {
  try {
    const inventory = await getInventory();
    res.send(inventory);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Controller error" });
  }
};

module.exports = { GetInventory };
