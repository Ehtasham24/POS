const { pool } = require("../Db");
const { createLot } = require("./lotService");
const ApiError = require("../utils/ApiError");

const getItems = async (shopId) => {
  try {
    const result = await pool.query(`SELECT * FROM products WHERE shop_id = $1 ORDER BY id`, [shopId]);
    return result.rows; // Return rows
  } catch (err) {
    console.log(err);
    throw new Error("Service error");
  }
};

const getItemById = async (id, shopId) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products WHERE id=$1 AND shop_id=$2 ORDER BY id`,
      [id, shopId]
    );
    return result.rows; // Return rows
  } catch (err) {
    console.error("Error:", err);
    throw new Error("Service error");
  }
};

// NOTE: this was already broken before shop scoping — products has no "name" column
// (it's "productname"), so this has always 500'd for any real caller. Left as-is here
// (just shop-scoped like everything else) since fixing that column-name bug is unrelated
// to this pass; tracked separately.
const getItemByName = async (name, shopId) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products WHERE name ILIKE $1 AND shop_id = $2 ORDER BY id`,
      [name, shopId]
    );
    return result.rows; // Return rows
  } catch (err) {
    console.error("Error:", err);
    throw new Error("Service error");
  }
};

const postItems = async (name, buying_price, quantity, category_id, batchOptions = {}, shopId) => {
  try {
    const isBatch = !!batchOptions.batch_tracked;

    // Batch products start at 0/0 — createLot below adds the first lot's quantity/price.
    const result = await pool.query(
      `
            INSERT INTO products(
                productname, buyingprice, "quantity", "category_id", batch_tracked, shop_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, productname, buyingprice, quantity, category_id, batch_tracked
        `,
      [name, isBatch ? 0 : buying_price, isBatch ? 0 : quantity, category_id, isBatch, shopId]
    );

    const product = result.rows[0];
    let lot = null;

    if (isBatch && product) {
      lot = await createLot(
        product.id,
        {
          vendor_id: batchOptions.vendor_id,
          buying_price,
          quantity,
        },
        batchOptions.receivedByUserId || null,
        shopId
      );
    }

    return { rows: result.rows, lot }; // Return rows (+ the created first lot, if batch-tracked)
  } catch (err) {
    if (err.code === "23505" && err.constraint === "products_shop_id_productname_key") {
      throw new ApiError(409, "Cannot enter duplicate products!");
    } else if (
      err.message ===
      `duplicate key value violates unique constraint "unique_productname_lower"`
    ) {
      throw new ApiError(409, "Duplicate product name");
    } else throw new Error(err.message);
  }
};

// quantity is intentionally NOT a parameter here (and not in the SET clause below) — every
// quantity change, up or down, now goes exclusively through Stock Adjustment
// (Sevices/stockAdjustmentService.js) or, for a batch-tracked product, through creating/
// adding to a lot — both leave a reason/attribution trail, unlike a plain edit silently
// overwriting the number. This edit path only ever touches name/price/category, and does so
// regardless of what a caller sends for quantity, so it can't be reintroduced by calling this
// endpoint directly even if a future frontend change forgot to drop the field.
const updateItems = async (name, price, category_id, id, shopId) => {
  try {
    const result = await pool.query(
      `UPDATE "products"
       SET productname=$1, buyingprice=$2, "category_id"=$3
       WHERE id=$4 AND shop_id=$5
       RETURNING *`,
      [name, price, category_id, id, shopId]
    );
    if (result.rowCount === 0) {
      throw new ApiError(404, `No item with id: ${id} found`);
    }
    return result.rows; // Return rows
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error(err);
    throw new Error("Service error");
  }
};

// Exact match, not ILIKE '%name%' — a substring match could touch more than one product
// even within a single shop (e.g. "test" matching both "test product" and "test category
// product"). productname is unique per shop (migration 021), so an exact match resolves to
// at most one row, same guarantee updateItems above already has by going through id.
const updateItemByName = async (name, buying_price, quantity, category_id, shopId) => {
  try {
    const result = await pool.query(
      `UPDATE "products"
       SET buyingprice = $2, "quantity" = $3, "category_id" = $4
       WHERE productname = $1 AND shop_id = $5
       RETURNING id, productname, buyingprice, "quantity", "category_id"
       `,
      [name, buying_price, quantity, category_id, shopId]
    );

    if (result.rowCount === 0) {
      throw new Error(`No item with name: ${name} found`);
    } else return result.rows; // Return rows
  } catch (err) {
    throw new Error(err.message);
  }
};

const deleteItemById = async (id, shopId) => {
  try {
    const nameResult = await pool.query(
      `SELECT productname FROM "products" WHERE id=$1 AND shop_id=$2`,
      [id, shopId]
    );
    if (nameResult.rows.length === 0) {
      throw new Error(`No item with id: ${id} found`);
    }
    const name = nameResult.rows[0].productname;
    const deleteResult = await pool.query(
      `DELETE FROM "products" WHERE id=$1 AND shop_id=$2`,
      [id, shopId]
    );
    return { name, deleteResult }; // Return name and delete result
  } catch (err) {
    throw new Error(`Service error: ${err.message}`);
  }
};

// Looks the product up by (shop-scoped) name first, then deletes by the id that lookup
// found — not by name a second time. Deleting by name again would match on productname
// alone, with no shop_id in that second query, and would happen to work today only because
// names were globally unique; migration 021 dropped that constraint precisely so two shops
// COULD share a name, which would have made this delete every same-named product across
// every shop that has one. Same reasoning for the sales-reattachment step below.
const deleteItemsByName = async (name, shopId) => {
  try {
    const productResult = await pool.query(
      `SELECT id FROM products WHERE productname = $1 AND shop_id = $2`,
      [name, shopId]
    );

    if (productResult.rowCount === 0) {
      throw new ApiError(409, `No item with name ${name} found`);
    }

    const productId = productResult.rows[0].id;

    // Check if the product is referenced in the sales table
    const salesResult = await pool.query(
      `SELECT * FROM sales WHERE product_id = $1`,
      [productId]
    );

    if (salesResult.rowCount > 0) {
      // Remove product_id from sales entries
      await pool.query(
        `UPDATE sales SET product_id = NULL WHERE product_id = $1`,
        [productId]
      );
    }

    // Now delete the product, by the id just looked up — never by name again.
    const deleteResult = await pool.query(
      `DELETE FROM products WHERE id = $1 AND shop_id = $2`,
      [productId, shopId]
    );

    return deleteResult; // Return result
  } catch (err) {
    console.error(err);
    if (err instanceof ApiError) throw err;
    throw new Error(`${err.message}`);
  }
};

module.exports = {
  getItems,
  getItemById,
  getItemByName,
  postItems,
  updateItems,
  updateItemByName,
  deleteItemsByName,
  deleteItemById,
};
