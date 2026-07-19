const {
  getCategories,
  getProductsForCategory,
  createCategory,
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

const PostCategory = async (req, res) => {
  const { category_name } = req.body;
  if (!category_name || !category_name.trim()) {
    return res.status(400).send({ message: "Category name is required" });
  }
  try {
    const result = await createCategory(category_name.trim());
    res.status(201).send(result.rows[0]);
  } catch (err) {
    console.log(err);
    if (err.message === "Category already exists") {
      res.status(409).send({ message: err.message });
    } else {
      res.status(500).send({ message: "Internal error" });
    }
  }
};

module.exports = { GetCategories, GetProductsForCategories, PostCategory };
