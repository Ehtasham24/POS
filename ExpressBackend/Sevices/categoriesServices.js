const { pool } = require("../Db");
const ApiError = require("../utils/ApiError");
const { withCache, invalidate } = require("../utils/cache");

// Categories barely ever change (one write path: createCategory below) but get read on
// almost every page — POS terminal, both product modals, Sales History, the category
// sidebar. Cached for 5 minutes and invalidated immediately on write, so a new category
// shows up right away instead of waiting out the TTL. Keyed per-shop — otherwise Shop A's
// category list would serve straight out of Shop B's cache entry.
const categoriesCacheKey = (shopId) => `categories:${shopId}`;
const CATEGORIES_CACHE_TTL_SECONDS = 300;

const getCategories = async (shopId) => {
  try {
    const rows = await withCache(categoriesCacheKey(shopId), CATEGORIES_CACHE_TTL_SECONDS, async () => {
      const result = await pool.query('SELECT * FROM "categories" WHERE shop_id = $1', [shopId]);
      return result.rows;
    });
    return { rows };
  } catch (err) {
    console.log(err);
    throw new Error("Internal error");
  }
};

const createCategory = async (category_name, shopId) => {
  try {
    const result = await pool.query(
      'INSERT INTO "categories" (category_name, shop_id) VALUES ($1, $2) RETURNING *',
      [category_name, shopId]
    );
    await invalidate(categoriesCacheKey(shopId));
    return result;
  } catch (err) {
    if (err.code === "23505") {
      throw new ApiError(409, "Category already exists");
    }
    throw new Error(err.message);
  }
};

// shop_id checked on both c and p — c.id alone isn't enough (a category id is just an
// integer, guessable/enumerable), so a request for another shop's category id resolves to
// "no products" here rather than that shop's real product list.
const getProductsForCategory = async (id, shopId) => {
  try {
    const query = `
      SELECT p.*,
        COUNT(l.id) AS lot_count
      FROM "products" p
      JOIN "categories" c ON p."category_id" = c.id AND c.shop_id = $2
      LEFT JOIN "lots" l ON l.product_id = p.id AND l.qty_remaining > 0
      WHERE c.id = $1 AND p.shop_id = $2
      GROUP BY p.id;
    `;
    const result = await pool.query(query, [id, shopId]);
    return result;
  } catch (err) {
    console.error(err);
    throw new Error("Internal error");
  }
};

module.exports = { getCategories, getProductsForCategory, createCategory };
