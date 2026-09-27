import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAuth } from "auth/AuthContext";
import { replaceCart } from "cartRedux/cartSlice";
import { loadSavedCart, saveCart } from "utils/posMemory";

// Keeps the in-progress cart across a reload, a crashed tab, or a phone killing the app in
// the background — per user, so logging out (or another user logging in on the same till)
// never shows the previous person's cart. Renders nothing.
export default function CartPersistence() {
  const { user } = useAuth();
  const cart = useSelector((state) => state.cart.carts);
  const dispatch = useDispatch();
  const userId = user?.id || null;
  // Which user's cart is currently loaded — saving is skipped until the restore for the
  // current user has happened, or the empty initial cart would overwrite their saved one.
  const loadedFor = useRef(undefined);

  useEffect(() => {
    dispatch(replaceCart(loadSavedCart(userId)));
    loadedFor.current = userId;
  }, [userId, dispatch]);

  useEffect(() => {
    if (loadedFor.current === userId && userId) saveCart(userId, cart);
  }, [cart, userId]);

  return null;
}
