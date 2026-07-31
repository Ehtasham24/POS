const {
  getCategories,
  getProductsForCategory,
} = require("../Sevices/categoriesServices");

const GetCategories = async (req, res) => {
  try {
    const result = await getCategories();
    res.send(result.rows);
  } catch (err) {
    console.log(err);
    res.send({ message: "Internal error" });
  }
};

const GetProductsForCategories = async (req, res) => {
  const id = req.params.id;
  try {
    const result = await getProductsForCategory(id);
    res.send(result.rows);
  } catch (err) {
    console.log(err);
    res.send({ message: "Internal error" });
  }
};
//TESTINGss PR FUNCTIONALITY CHERRY SPOT

module.exports = { GetCategories, GetProductsForCategories };
