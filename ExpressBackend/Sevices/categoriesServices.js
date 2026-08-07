const { pool } = require("../Db");

const getCategories = async () => {
  try {
    const result = await pool.query('SELECT * FROM "categories"');
    return result;
  } catch (err) {
    console.log(err);
    res.send({ message: "Internal error" });
  }
};

const createCategory = async (category_name) => {
  try {
    const result = await pool.query(
      'INSERT INTO "categories" (category_name) VALUES ($1) RETURNING *',
      [category_name]
    );
    return result;
  } catch (err) {
    if (err.code === "23505") {
      throw new Error("Category already exists");
    }
    throw new Error(err.message);
  }
};

const getProductsForCategory = async (id) => {
  try {
    const query = `
      SELECT p.*,
        COUNT(l.id) AS lot_count
      FROM "products" p
      JOIN "categories" c ON p."category_id" = c.id
      LEFT JOIN "lots" l ON l.product_id = p.id AND l.qty_remaining > 0
      WHERE c.id = $1
      GROUP BY p.id;
    `;
    const result = await pool.query(query, [id]);
    console.log(result);
    return result;
  } catch (err) {
    console.error(err);
    throw new Error("Internal error");
  }
};

module.exports = { getCategories, getProductsForCategory, createCategory };
