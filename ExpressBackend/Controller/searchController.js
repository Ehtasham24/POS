const { searchProducts } = require("../Sevices/searchService");

const Search = async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.send([]);
  }
  try {
    const results = await searchProducts(q.trim());
    res.send(results);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Controller error" });
  }
};

module.exports = { Search };
