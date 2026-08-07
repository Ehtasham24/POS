import { createSlice } from "@reduxjs/toolkit";

// Cart line shape: { id, productId, productname, category_id, quantity (max sellable —
// product.quantity for simple items, lot.qty_remaining for batch items), sellingPrice,
// sellingQuantity, lotId?, lotCode? }. `id` is the product id for simple items or
// `lot-{lotId}` for batch items, so the same physical lot never merges with another one.
const initialState = {
  carts: [],
};

export const CartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    addCart(state, action) {
      const addQty = action.payload.sellingQuantity || 1;
      const existingProduct = state.carts.find(
        (item) => item.id === action.payload.id
      );
      if (existingProduct) {
        existingProduct.sellingQuantity = Math.min(
          existingProduct.sellingQuantity + addQty,
          existingProduct.quantity
        );
      } else {
        state.carts.push({
          ...action.payload,
          sellingQuantity: Math.min(addQty, action.payload.quantity || addQty),
        });
      }
    },
    clearCart(state) {
      state.carts = [];
    },
    removeCart(state, action) {
      state.carts = state.carts.filter((item) => item.id !== action.payload);
    },
    increaseQuantity(state, action) {
      console.log(action.payload);
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
  },
});

export const {
  addCart,
  removeCart,
  clearCart,
  increaseQuantity,
  decreaseQuantity,
  setQuantity,
} = CartSlice.actions;

export default CartSlice.reducer;
