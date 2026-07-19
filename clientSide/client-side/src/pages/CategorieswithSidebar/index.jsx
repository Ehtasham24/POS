import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Helmet } from "react-helmet";
import { Text, Heading } from "components";
import Footer from "components/Footer";
import Header from "components/Header";
import { useNavigate } from "react-router-dom";
import {
  HiOutlinePlusCircle,
  HiOutlineTag,
  HiOutlineTrash,
  HiOutlinePencil,
  HiOutlinePrinter,
  HiOutlineChartBar,
  HiOutlineShoppingCart,
  HiOutlineSquares2X2,
} from "react-icons/hi2";
import {
  increaseQuantity,
  decreaseQuantity,
  removeCart,
} from "cartRedux/cartSlice";

import AddProductModal from "categoriesComponents/addProductModel";
import AddCategoryModal from "categoriesComponents/addCategoryModal";
import DeleteProductModal from "categoriesComponents/deleteProductModal";
import UpdateProductModal from "categoriesComponents/updateProductModal";
import CartCheckout from "categoriesComponents/cartCheckout";

const sidebarButtonClass =
  "flex items-center justify-center gap-2 w-full text-white-A700 bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-3 text-center transition-colors";

export default function CategorieswithSidebarPage() {
  const dispatch = useDispatch();
  const [categories, setCategories] = useState([]);
  const navigate = useNavigate();

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [isDeleteProductOpen, setIsDeleteProductOpen] = useState(false);
  const [isUpdateProductOpen, setIsUpdateProductOpen] = useState(false);

  const fetchData = async () => {
    try {
      const response = await fetch("http://localhost:4000/categories");

      if (!response.ok) {
        throw new Error("Failed to fetch categories: " + response.status);
      }

      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const productsPage = (prodNum) => {
    navigate(`/categories/${prodNum}`);
  };

  const checkOut = () => {
    setIsCartOpen(true);
  };

  const closeCheckout = () => {
    setIsCartOpen(false);
  };

  const handleIncrease = (id) => {
    dispatch(increaseQuantity({ id }));
  };

  const handleDecrease = (id) => {
    const currentItem = cart.find((item) => item.id === id); // Find the item in the cart
    if (currentItem && currentItem.quantity > 0) {
      dispatch(decreaseQuantity({ id }));
      if (currentItem.quantity === 1) {
        // If the quantity becomes 0 after decreasing, remove the item from the cart
        dispatch(removeCart({ id }));
      }
    }
  };

  // Navigate to Sales Report
  const goToSalesReport = () => {
    navigate("/report");
  };

  // Navigate to Print Recent Bill
  const goToBill = () => {
    navigate("/bill");
  };

  const cart = useSelector((store) => store.cart.carts);

  return (
    <>
      <Helmet>
        <title>POS system</title>
        <meta
          name="description"
          content="Web site created using create-react-app"
        />
      </Helmet>

      <AddProductModal
        isOpen={isAddProductOpen}
        onClose={() => setIsAddProductOpen(false)}
      />
      <AddCategoryModal
        isOpen={isAddCategoryOpen}
        onClose={() => setIsAddCategoryOpen(false)}
        onCategoryAdded={fetchData}
      />
      <DeleteProductModal
        isOpen={isDeleteProductOpen}
        onClose={() => setIsDeleteProductOpen(false)}
      />
      <UpdateProductModal
        isOpen={isUpdateProductOpen}
        onClose={() => setIsUpdateProductOpen(false)}
      />

      <div className="flex flex-col items-center justify-start w-full bg-white-A700 dark:bg-gray-900 min-h-screen">
        <Header className="flex flex-row justify-between items-center w-full p-6 sm:p-5 bg-white-A700" />
        <div className="flex flex-col items-center justify-start w-full mt-8 gap-8 md:px-5 max-w-[1636px] relative">
          <Heading as="h1">Categories</Heading>
          <div className="flex flex-row md:flex-col justify-start items-start w-full gap-8 md:gap-5">
            <div className="flex flex-col items-center justify-start w-[16%] md:w-full gap-4">
              <div className="flex flex-col items-start justify-start w-full gap-3 bg-surface-subtle dark:bg-gray-800 rounded-xl2 p-4">
                <button
                  className={sidebarButtonClass}
                  type="button"
                  onClick={() => setIsAddProductOpen(true)}
                >
                  <HiOutlinePlusCircle className="text-lg" />
                  Add Product
                </button>
                <button
                  className={sidebarButtonClass}
                  type="button"
                  onClick={() => setIsAddCategoryOpen(true)}
                >
                  <HiOutlineTag className="text-lg" />
                  Add Category
                </button>
                <button
                  className={`${sidebarButtonClass} bg-danger-600 hover:bg-danger-700 focus:ring-danger-300`}
                  type="button"
                  onClick={() => setIsDeleteProductOpen(true)}
                >
                  <HiOutlineTrash className="text-lg" />
                  Delete Product
                </button>
                <button
                  className={sidebarButtonClass}
                  type="button"
                  onClick={() => setIsUpdateProductOpen(true)}
                >
                  <HiOutlinePencil className="text-lg" />
                  Update Product
                </button>
                <button
                  className={`${sidebarButtonClass} bg-gray-800 hover:bg-gray-900 focus:ring-gray-300`}
                  type="button"
                  onClick={goToBill}
                >
                  <HiOutlinePrinter className="text-lg" />
                  Print Recent Bill
                </button>
                <button
                  className={`${sidebarButtonClass} bg-gray-800 hover:bg-gray-900 focus:ring-gray-300`}
                  type="button"
                  onClick={goToSalesReport}
                >
                  <HiOutlineChartBar className="text-lg" />
                  Sales Report
                </button>
              </div>

              {/* Cart Items */}
              <div className="flex flex-col items-start justify-start w-full gap-3 bg-surface-subtle dark:bg-gray-800 rounded-xl2 p-4">
                <div className="flex items-center gap-2">
                  <HiOutlineShoppingCart className="text-xl text-primary-600" />
                  <h2 className="font-semibold text-lg text-gray-800 dark:text-gray-100">
                    Cart Items
                  </h2>
                </div>
                {cart.length === 0 ? (
                  <Text as="p" className="!text-gray-500 text-sm">
                    Your cart is empty.
                  </Text>
                ) : (
                  <ul className="w-full flex flex-col gap-2">
                    {cart.map((item) => (
                      <li
                        key={item.id}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 text-gray-800 dark:text-gray-100"
                      >
                        {item.productname}
                      </li>
                    ))}
                  </ul>
                )}
                {cart.length > 0 && (
                  <button
                    className="w-full text-white-A700 bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition-colors"
                    type="button"
                    onClick={checkOut}
                  >
                    Checkout
                  </button>
                )}

                {/* cart checkout */}
                <CartCheckout
                  isCartOpen={isCartOpen}
                  closeCheckout={closeCheckout}
                  cart={cart}
                  handleDecrease={handleDecrease}
                  handleIncrease={handleIncrease}
                />
              </div>
            </div>

            <div className="flex flex-row justify-start w-[84%] md:w-full">
              <div className="flex flex-col items-center justify-start w-full gap-8">
                <div className="justify-center w-full gap-6 grid-cols-2 md:grid-cols-1 md:gap-5 grid">
                  {categories.map((category) => (
                    <button
                      onClick={() => productsPage(category.id)}
                      key={category.id}
                      className="text-left rounded-xl2 shadow-card hover:shadow-cardHover transition-shadow"
                    >
                      <div className="flex flex-row sm:flex-col justify-start items-center w-full gap-6 p-8 md:p-5 sm:gap-4 bg-surface-subtle dark:bg-gray-800 rounded-xl2">
                        <div className="h-[100px] w-[100px] shrink-0 rounded-xl2 bg-primary-50 dark:bg-gray-700 flex items-center justify-center">
                          <HiOutlineSquares2X2 className="text-4xl text-primary-600" />
                        </div>
                        <div className="flex flex-col items-start justify-start">
                          <Heading as="h2">{category.category_name}</Heading>
                          <Text size="lg" as="p">
                            Collection
                          </Text>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <Footer className="flex justify-center items-center w-full mt-[85px] p-[30px] sm:p-5 bg-gray-800" />
      </div>
    </>
  );
}
