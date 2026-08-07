const { pool } = require("../Db");

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

// "Slippers" -> "SLP" (first 3 consonants, adjacent repeats collapsed).
// Falls back to the first letters of the name if it's too short/vowel-heavy.
const generatePrefix = (name) => {
  const letters = String(name || "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
  if (!letters) return "GEN";

  const consonants = [];
  for (const ch of letters) {
    if (!VOWELS.has(ch) && consonants[consonants.length - 1] !== ch) {
      consonants.push(ch);
    }
    if (consonants.length === 3) break;
  }

  let prefix = consonants.length === 3 ? consonants.join("") : letters.slice(0, 3);
  return prefix.padEnd(3, "X");
};

// "Aslam Traders" -> "ASLAMTR" (alnum only, uppercased, capped so codes stay readable).
const vendorPrefix = (name) => {
  const letters = String(name || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  return (letters || "VENDOR").slice(0, 10);
};

// Atomically reserves the next lot number for this (vendor, product) pair.
const nextLotSerial = async (vendorId, productId) => {
  const result = await pool.query(
    `INSERT INTO lot_sequences(vendor_id, product_id, last_number) VALUES ($1, $2, 1)
     ON CONFLICT (vendor_id, product_id) DO UPDATE SET last_number = lot_sequences.last_number + 1
     RETURNING last_number`,
    [vendorId, productId]
  );
  return result.rows[0].last_number;
};

// Vendor + product coded, e.g. vendor "Aslam", product "Slippers" -> "ASLAM-SLP-001".
const generateLotCode = async (vendorId, productId) => {
  const [{ rows: vendorRows }, { rows: productRows }] = await Promise.all([
    pool.query(`SELECT name FROM contacts WHERE id = $1`, [vendorId]),
    pool.query(`SELECT productname FROM products WHERE id = $1`, [productId]),
  ]);
  if (!vendorRows[0]) throw new Error("Vendor not found");
  if (!productRows[0]) throw new Error("Product not found");

  const serial = await nextLotSerial(vendorId, productId);
  return `${vendorPrefix(vendorRows[0].name)}-${generatePrefix(productRows[0].productname)}-${String(
    serial
  ).padStart(3, "0")}`;
};

// Creates the first (or an additional) lot for a product from a vendor and syncs the
// product's cached aggregate quantity + batch_tracked flag.
const createLot = async (productId, { vendor_id, buying_price, quantity }) => {
  if (!vendor_id) throw new Error("A vendor is required to create a lot");
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be a positive number");

  const lotCode = await generateLotCode(vendor_id, productId);

  const { rows } = await pool.query(
    `INSERT INTO lots (product_id, vendor_id, lot_code, buying_price, qty_received, qty_remaining)
     VALUES ($1, $2, $3, $4, $5, $5)
     RETURNING *`,
    [productId, vendor_id, lotCode, buying_price, qty]
  );

  await pool.query(
    `UPDATE products SET batch_tracked = true, quantity = quantity + $2, buyingprice = $3 WHERE id = $1`,
    [productId, qty, buying_price]
  );

  return rows[0];
};

// Adds quantity to an existing lot at that lot's existing price (same batch = same cost).
const addStockToLot = async (lotId, quantity) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be a positive number");

  const { rows } = await pool.query(
    `UPDATE lots SET qty_received = qty_received + $2, qty_remaining = qty_remaining + $2
     WHERE id = $1 RETURNING *`,
    [lotId, qty]
  );
  if (!rows[0]) throw new Error("Lot not found");

  await pool.query(`UPDATE products SET quantity = quantity + $2 WHERE id = $1`, [
    rows[0].product_id,
    qty,
  ]);

  return rows[0];
};

const getLotsForProduct = async (productId) => {
  const result = await pool.query(
    `SELECT l.*, c.name AS vendor_name
     FROM lots l
     LEFT JOIN contacts c ON c.id = l.vendor_id
     WHERE l.product_id = $1
     ORDER BY l.received_at`,
    [productId]
  );
  return result.rows;
};

const getLotById = async (lotId) => {
  const result = await pool.query(
    `SELECT l.*, c.name AS vendor_name
     FROM lots l
     LEFT JOIN contacts c ON c.id = l.vendor_id
     WHERE l.id = $1`,
    [lotId]
  );
  return result.rows[0] || null;
};

const getLotByCode = async (lotCode) => {
  const result = await pool.query(
    `SELECT l.*, c.name AS vendor_name, p.productname, p.category_id
     FROM lots l
     JOIN products p ON p.id = l.product_id
     LEFT JOIN contacts c ON c.id = l.vendor_id
     WHERE l.lot_code = $1`,
    [lotCode]
  );
  return result.rows[0] || null;
};

// Decrements a lot's remaining quantity (a sale) and keeps the product's cached total in sync.
const decrementLot = async (lotId, quantity) => {
  const qty = Number(quantity);
  const { rows } = await pool.query(`SELECT * FROM lots WHERE id = $1`, [lotId]);
  const lot = rows[0];
  if (!lot) throw new Error("Lot not found");
  if (qty > lot.qty_remaining) {
    throw new Error(`Insufficient stock in lot ${lot.lot_code} (${lot.qty_remaining} remaining)`);
  }

  const { rows: updated } = await pool.query(
    `UPDATE lots SET qty_remaining = qty_remaining - $2 WHERE id = $1 RETURNING *`,
    [lotId, qty]
  );
  await pool.query(`UPDATE products SET quantity = quantity - $2 WHERE id = $1`, [
    lot.product_id,
    qty,
  ]);

  return updated[0];
};

module.exports = {
  generatePrefix,
  vendorPrefix,
  generateLotCode,
  createLot,
  addStockToLot,
  getLotsForProduct,
  getLotById,
  getLotByCode,
  decrementLot,
};
