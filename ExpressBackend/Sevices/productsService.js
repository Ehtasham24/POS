const { pool } = require("../Db");
const { createLot } = require("./lotService");
const ApiError = require("../utils/ApiError");

const getItems = async () => {
  try {
    console.log(`Service for getItems`);
    const result = await pool.query(`SELECT * FROM products ORDER BY id`);
    console.log(result.rows);
    return result.rows; // Return rows
  } catch (err) {
    console.log(err);
    throw new Error("Service error");
  }
};

const getItemById = async (id) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products WHERE id=$1 ORDER BY id`,
      [id]
    );
    console.log(result.rows);
    return result.rows; // Return rows
  } catch (err) {
    console.error("Error:", err);
    throw new Error("Service error");
  }
};

const getItemByName = async (name) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products WHERE name ILIKE $1 ORDER BY id`,
      [name]
    );
    return result.rows; // Return rows
  } catch (err) {
    console.error("Error:", err);
    throw new Error("Service error");
  }
};

const postItems = async (name, buying_price, quantity, category_id, batchOptions = {}) => {
  try {
    const isBatch = !!batchOptions.batch_tracked;

    // Batch products start at 0/0 — createLot below adds the first lot's quantity/price.
    const result = await pool.query(
      `
            INSERT INTO products(
                productname, buyingprice, "quantity", "category_id", batch_tracked)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, productname, buyingprice, quantity, category_id, batch_tracked
        `,
      [name, isBatch ? 0 : buying_price, isBatch ? 0 : quantity, category_id, isBatch]
    );

    const product = result.rows[0];
    let lot = null;

    if (isBatch && product) {
      lot = await createLot(product.id, {
        vendor_id: batchOptions.vendor_id,
        buying_price,
        quantity,
      });
    }

    return { rows: result.rows, lot }; // Return rows (+ the created first lot, if batch-tracked)
  } catch (err) {
    if (err.code === "23505" && err.constraint === "products_productname_key") {
      throw new ApiError(409, "Cannot enter duplicate products!");
    } else if (
      err.message ===
      `duplicate key value violates unique constraint "unique_productname_lower"`
    ) {
      throw new ApiError(409, "Duplicate product name");
    } else throw new Error(err.message);
  }
};

const updateItems = async (name, price, quantity, category_id, id) => {
  try {
    // Quantity can only go UP through this plain edit path — a decrease needs a reason
    // (Stock Adjustment, Sevices/stockAdjustmentService.js) so shrinkage/theft/miscounts
    // leave an audit trail instead of silently overwriting the number. Raising it (received
    // more stock of a simple, non-batch-tracked product) isn't the direction fraud/error
    // hides in, so that stays allowed here. Checked here, not just in the frontend modals,
    // so it can't be bypassed by calling this endpoint directly.
    const { rows: currentRows } = await pool.query(`SELECT "quantity" FROM "products" WHERE id = $1`, [id]);
    if (currentRows.length === 0) {
      throw new ApiError(404, `No item with id: ${id} found`);
    }
    const currentQuantity = Number(currentRows[0].quantity);
    const newQuantity = Number(quantity);
    if (Number.isFinite(newQuantity) && newQuantity < currentQuantity) {
      throw new ApiError(
        400,
        `Quantity can only be increased here — to lower it, use "Adjust Stock" on the Inventory page so the reason is recorded.`
      );
    }

    const result = await pool.query(
      `UPDATE "products"
       SET productname=$1, buyingprice=$2, "quantity"=$3, "category_id"=$4
       WHERE id=$5
       RETURNING *`,
      [name, price, quantity, category_id, id]
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

const updateItemByName = async (name, buying_price, quantity, category_id) => {
  try {
    console.log(
      `Services hit with ${(name, buying_price, category_id, quantity)}`
    );
    const result = await pool.query(
      `UPDATE "products"
       SET buyingprice = $2, "quantity" = $3, "category_id" = $4
       WHERE productname ILIKE $1
       RETURNING id, productname, buyingprice, "quantity", "category_id"
       `,
      [`%${name}%`, buying_price, quantity, category_id]
    );

    console.log("Result----->", result.rows);
    if (result.rowCount === 0) {
      throw new Error(`No item with name: ${name} found`);
    } else return result.rows; // Return rows
  } catch (err) {
    console.log(err.message);
    throw new Error(err.message);
  }
};

const deleteItemById = async (id) => {
  try {
    const nameResult = await pool.query(
      `SELECT productname FROM "products" WHERE id=$1`,
      [id]
    );
    if (nameResult.rows.length === 0) {
      throw new Error(`No item with id: ${id} found`);
    }
    const name = nameResult.rows[0].productname;
    const deleteResult = await pool.query(
      `DELETE FROM "products" WHERE id=$1`,
      [id]
    );
    return { name, deleteResult }; // Return name and delete result
  } catch (err) {
    throw new Error(`Service error: ${err.message}`);
  }
};

const deleteItemsByName = async (name) => {
  try {
    // Check if the product exists
    const productResult = await pool.query(
      `SELECT id FROM products WHERE productname = $1`,
      [name]
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

    // Now delete the product
    const deleteResult = await pool.query(
      `DELETE FROM products WHERE productname = $1`,
      [name]
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
