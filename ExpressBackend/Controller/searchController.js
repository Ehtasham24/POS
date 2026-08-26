const { searchProducts } = require("../Sevices/searchService");
const asyncHandler = require("../utils/asyncHandler");

const Search = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.send([]);
  }
  const results = await searchProducts(q.trim(), req.user.shopId);
  res.send(results);
});

module.exports = { Search };
