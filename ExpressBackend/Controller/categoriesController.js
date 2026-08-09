const {
  getCategories,
  getProductsForCategory,
  createCategory,
} = require("../Sevices/categoriesServices");
const asyncHandler = require("../utils/asyncHandler");

const GetCategories = asyncHandler(async (req, res) => {
  const result = await getCategories();
  res.send(result.rows);
});

const GetProductsForCategories = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const result = await getProductsForCategory(id);
  res.send(result.rows);
});

const PostCategory = asyncHandler(async (req, res) => {
  const { category_name } = req.body;
  if (!category_name || !category_name.trim()) {
    return res.status(400).send({ message: "Category name is required" });
  }
  const result = await createCategory(category_name.trim());
  res.status(201).send(result.rows[0]);
});

module.exports = { GetCategories, GetProductsForCategories, PostCategory };
