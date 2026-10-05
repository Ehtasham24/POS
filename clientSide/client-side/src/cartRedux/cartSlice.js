import { createSlice } from "@reduxjs/toolkit";

// Cart line shape: { id, productId, productname, category_id, quantity (max sellable —
// product.quantity for simple items, lot.qty_remaining for batch items), sellingPrice,
// sellingQuantity, lotId?, lotCode?, stockKey }. `stockKey` is the product id for simple
// items or `lot-{lotId}` for batch items, so the same physical lot never merges with another
// one. There's one line per stockKey and price: more of it at the same price joins that line,
// at a different price it gets a line of its own (selling prices are agreed per sale), never
// silently taking the existing line's price. `id` is the line's own: the stockKey for the
// first line, made unique for the others.
export const stockKeyOf = (line) => line.stockKey ?? line.id;

const initialState = {
  carts: [],
};

export const CartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    addCart(state, action) {
      const line = action.payload;
      const addQty = line.sellingQuantity || 1;
      const stockKey = stockKeyOf(line);
      const price = Number(line.sellingPrice);
      const existing = state.carts.find((item) => stockKeyOf(item) === stockKey && Number(item.sellingPrice) === price);
      if (existing) {
        existing.sellingQuantity = Math.min(existing.sellingQuantity + addQty, existing.quantity);
        return;
      }
      const taken = new Set(state.carts.map((item) => item.id));
      let id = stockKey;
      for (let n = 2; taken.has(id); n++) id = `${stockKey}#${n}`;
      state.carts.push({
        ...line,
        id,
        stockKey,
        sellingQuantity: Math.min(addQty, line.quantity || addQty),
      });
    },
    clearCart(state) {
      state.carts = [];
    },
    removeCart(state, action) {
      state.carts = state.carts.filter((item) => item.id !== action.payload);
    },
    increaseQuantity(state, action) {
      const { id } = action.payload;
      const item = state.carts.find((item) => item.id === id);

      if (item) {
        if (item.sellingQuantity < item.quantity) {
          item.sellingQuantity += 1;
        }
      }
    },
    decreaseQuantity(state, action) {
      const { id } = action.payload;
      const itemIndex = state.carts.findIndex((item) => item.id === id);
      if (itemIndex !== -1 && state.carts[itemIndex].sellingQuantity > 0) {
        state.carts[itemIndex].sellingQuantity -= 1;
        if (state.carts[itemIndex].sellingQuantity === 0) {
          state.carts.splice(itemIndex, 1);
        }
      }
    },
    setQuantity(state, action) {
      const { id, quantity } = action.payload;
      const item = state.carts.find((item) => item.id === id);
      if (item) {
        item.sellingQuantity = Math.min(Math.max(quantity, 1), item.quantity);
      }
    },
    // Per-line price edit on the register — prices here are negotiated per sale (products
    // carry no fixed selling price), so correcting one shouldn't mean removing and re-adding
    // the line. Non-positive/NaN input is ignored rather than zeroing the line.
    setPrice(state, action) {
      const { id, price } = action.payload;
      const item = state.carts.find((item) => item.id === id);
      const value = Math.round(Number(price));
      if (item && Number.isFinite(value) && value > 0) {
        item.sellingPrice = value;
      }
    },
    // Swaps the whole cart — resuming a held sale, or restoring the saved cart after a
    // reload (see components/CartPersistence).
    replaceCart(state, action) {
      state.carts = Array.isArray(action.payload) ? action.payload : [];
    },
  },
});

export const {
  addCart,
  removeCart,
  clearCart,
  increaseQuantity,
  decreaseQuantity,
  setQuantity,
  setPrice,
  replaceCart,
} = CartSlice.actions;

export default CartSlice.reducer;
