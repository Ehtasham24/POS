// Small per-device memory for the register, kept in localStorage: the price each product
// last sold at, held (parked) sales, the saved in-progress cart, and the grid/list view.
// Every read/write tolerates unavailable or corrupt storage — losing this memory only ever
// costs convenience, never a sale.
//
// Product/lot ids are database-wide unique, so remembered prices can't collide across
// shops; held sales and the saved cart are keyed by user, so a shared device never shows
// one user's (or shop's) cart to the next person who logs in.

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full/unavailable — the memory just won't persist
  }
};

// --- Last selling price per product -------------------------------------------------------
// Products carry no fixed selling price (it's agreed per sale), so the register pre-fills —
// and a tile can one-tap add at — the price this product last sold for on this device.
const PRICES_KEY = "pos.lastPrices.v1";
const MAX_REMEMBERED = 2000;
// "p" prefix: integer-like object keys are always ordered numerically, not by insertion,
// which would break the "drop the oldest" trim below.
const priceKey = (productId) => `p${productId}`;

// The whole map in one read — a grid of hundreds of tiles looks prices up with priceFrom()
// instead of parsing storage once per tile.
export const loadLastPrices = () => read(PRICES_KEY, {});

export const priceFrom = (prices, productId) => {
  const price = prices[priceKey(productId)];
  return Number.isFinite(price) && price > 0 ? price : null;
};

export const getLastPrice = (productId) => priceFrom(loadLastPrices(), productId);

export const rememberPrices = (lines) => {
  const prices = read(PRICES_KEY, {});
  for (const line of lines) {
    const productId = line.productId || line.id;
    const price = Number(line.sellingPrice);
    if (productId && Number.isFinite(price) && price > 0) {
      delete prices[priceKey(productId)]; // re-insert so it counts as most recent
      prices[priceKey(productId)] = price;
    }
  }
  const keys = Object.keys(prices);
  if (keys.length > MAX_REMEMBERED) {
    for (const key of keys.slice(0, keys.length - MAX_REMEMBERED)) delete prices[key];
  }
  write(PRICES_KEY, prices);
};

// --- Saved in-progress cart (survives a reload / crash) ------------------------------------
const cartKey = (userId) => `pos.cart.v1.${userId}`;
export const loadSavedCart = (userId) => (userId ? read(cartKey(userId), []) : []);
export const saveCart = (userId, lines) => userId && write(cartKey(userId), lines.length ? lines : null);

// --- Held (parked) sales -------------------------------------------------------------------
const heldKey = (userId) => `pos.heldSales.v1.${userId}`;
export const MAX_HELD_SALES = 10;
export const loadHeldSales = (userId) => (userId ? read(heldKey(userId), []) : []);
export const saveHeldSales = (userId, sales) => userId && write(heldKey(userId), sales.length ? sales : null);

// --- Register view preference ---------------------------------------------------------------
const VIEW_KEY = "pos.registerView.v1";
export const loadRegisterView = () => (read(VIEW_KEY, "grid") === "list" ? "list" : "grid");
export const saveRegisterView = (view) => write(VIEW_KEY, view);
