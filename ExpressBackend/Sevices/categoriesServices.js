const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { withCache, invalidate } = require("../utils/cache");

// Categories barely ever change (one write path: createCategory below) but get read on
// almost every page — POS terminal, both product modals, Sales History, the category
// sidebar. Cached for 5 minutes and invalidated immediately on write, so a new category
// shows up right away instead of waiting out the TTL.
const CATEGORIES_CACHE_KEY = "categories:all";
const CATEGORIES_CACHE_TTL_SECONDS = 300;

const getCategories = async () => {
  try {
    const rows = await withCache(CATEGORIES_CACHE_KEY, CATEGORIES_CACHE_TTL_SECONDS, async () => {
      const result = await pool.query('SELECT * FROM "categories"');
      return result.rows;
    });
    return { rows };
  } catch (err) {
    console.log(err);
    throw new Error("Internal error");
  }
};

const createCategory = async (category_name) => {
  try {
    const result = await pool.query(
      'INSERT INTO "categories" (category_name) VALUES ($1) RETURNING *',
      [category_name]
    );
    await invalidate(CATEGORIES_CACHE_KEY);
    return result;
  } catch (err) {
    if (err.code === "23505") {
      throw new ApiError(409, "Category already exists");
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
