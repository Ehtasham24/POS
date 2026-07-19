import { useDispatch, useSelector } from "react-redux";
import { HiOutlineCube, HiOutlineShoppingBag, HiXMark } from "react-icons/hi2";
import { Text } from "components";
import {
  removeCart,
  increaseQuantity,
  decreaseQuantity,
  clearCart,
} from "cartRedux/cartSlice";

function CartCheckout({ isCartOpen, closeCheckout }) {
  const cart = useSelector((state) => state.cart.carts);
  const dispatch = useDispatch();

  // Function to calculate the subtotal
  const calculateSubtotal = () => {
    return cart.reduce(
      (total, item) => total + item.sellingPrice * item.sellingQuantity,
      0
    );
  };

  // Function to handle checkout button click
  const handleCheckout = async () => {
    const subtotal = calculateSubtotal();

    // Prepare the sales data to be sent to the API
    const salesData = cart.map((item) => ({
      sellingPrice: item.sellingPrice,
      quantity: item.sellingQuantity,
      productID: item.id,
    }));

    try {
      await Promise.all(
        salesData.map(async (sale) => {
          const response = await fetch("http://localhost:4000/sales", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(sale),
          });

          if (!response.ok) {
            throw new Error("Failed to sell product");
          }
          return response.json();
        })
      );

      dispatch(clearCart());
      closeCheckout();
      alert(
        `Total amount for checkout: PKR ${subtotal}\nProducts sold successfully!`
      );
    } catch (error) {
      alert(error.message);
    }
  };

  const handleRemove = (id) => {
    dispatch(removeCart(id));
  };

  const handleDecrease = (id) => {
    dispatch(decreaseQuantity({ id }));
  };

  const handleIncrease = (item) => {
    dispatch(increaseQuantity(item));
  };

  return (
    <>
      {isCartOpen && (
        <div
          className="relative z-50"
          aria-labelledby="slide-over-title"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-gray-800/50 transition-opacity"
            onClick={closeCheckout}
          ></div>

          <div className="fixed inset-0 overflow-hidden">
            <div className="absolute inset-0 overflow-hidden">
              <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
                <div className="pointer-events-auto w-screen max-w-md">
                  <div className="flex h-full flex-col overflow-y-scroll bg-white-A700 dark:bg-gray-800 shadow-modal">
                    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                      <div className="flex items-start justify-between">
                        <h2
                          className="text-lg font-semibold text-gray-800 dark:text-gray-100"
                          id="slide-over-title"
                        >
                          Shopping cart
                        </h2>
                        <div className="ml-3 flex h-7 items-center">
                          <button
                            type="button"
                            className="text-gray-500 dark:text-gray-400 hover:bg-surface-muted dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 rounded-lg w-9 h-9 inline-flex items-center justify-center transition-colors"
                            onClick={closeCheckout}
                          >
                            <span className="sr-only">Close panel</span>
                            <HiXMark className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-8">
                        {cart.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <HiOutlineShoppingBag className="text-5xl text-gray-400" />
                            <Text className="!text-gray-500">
                              Your cart is empty.
                            </Text>
                          </div>
                        ) : (
                          <div className="flow-root">
                            <ul className="-my-6 divide-y divide-surface-border dark:divide-gray-700">
                              {cart.map((item) => (
                                <li key={item.id} className="flex py-6">
                                  <div className="h-24 w-24 flex-shrink-0 rounded-lg bg-surface-muted dark:bg-gray-700 flex items-center justify-center">
                                    <HiOutlineCube className="text-3xl text-gray-400" />
                                  </div>

                                  <div className="ml-4 flex flex-1 flex-col">
                                    <div>
                                      <div className="flex justify-between text-base font-medium text-gray-800 dark:text-gray-100">
                                        <h3>{item.productname}</h3>
                                        <p className="ml-4">
                                          PKR {item.sellingPrice}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex flex-1 items-end justify-between text-sm">
                                      <span className="text-gray-500 dark:text-gray-400">
                                        Quantity:
                                      </span>
                                      <div className="flex items-center gap-3">
                                        <button
                                          onClick={() =>
                                            handleDecrease(item.id)
                                          }
                                          className="w-6 h-6 rounded-full bg-surface-muted dark:bg-gray-700 hover:bg-surface-border dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100"
                                        >
                                          -
                                        </button>
                                        <p className="text-gray-800 dark:text-gray-100">
                                          {item.sellingQuantity}
                                        </p>
                                        <button
                                          onClick={() => handleIncrease(item)}
                                          className="w-6 h-6 rounded-full bg-surface-muted dark:bg-gray-700 hover:bg-surface-border dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                    <div className="flex mt-3">
                                      <button
                                        type="button"
                                        className="font-medium text-danger-600 hover:text-danger-700 text-sm"
                                        onClick={() => handleRemove(item.id)}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-surface-border bg-white-A700 px-4 py-6 sm:px-6">
                      <div className="flex justify-between text-base font-medium text-gray-800">
                        <p>Subtotal</p>
                        <p>PKR {calculateSubtotal()}</p>
                      </div>
                      <p className="mt-0.5 text-sm text-gray-500">
                        Shipping and taxes calculated at checkout.
                      </p>
                      <div className="mt-6 flex justify-center">
                        <button
                          onClick={handleCheckout}
                          disabled={cart.length === 0}
                          className="flex items-center justify-center rounded-lg bg-primary-600 px-6 py-3 text-base font-medium text-white-A700 shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Checkout
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default CartCheckout;
