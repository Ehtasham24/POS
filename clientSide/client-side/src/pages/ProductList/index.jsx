import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet";
import { useDispatch } from "react-redux";
import { addCart } from "cartRedux/cartSlice";
import Footer from "components/Footer";
import { Text, Heading, Modal } from "components";
import Header from "components/Header";
import { useParams } from "react-router-dom";
import { ImSearch } from "react-icons/im";
import { Link } from "react-router-dom";
import EditProductModal from "categoriesComponents/editProductModal";

export default function ProductListPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchValue, setSearchValue] = useState("");
  const [showPopup, setShowPopup] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sellingPrice, setSellingPrice] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [productToEdit, setProductToEdit] = useState(null);

  const { prodNum } = useParams(); // Get the category ID from the URL
  const dispatch = useDispatch();

  // Fetch categories when the component mounts
  useEffect(() => {
    const fetchCategories = async () => {
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

    fetchCategories();
  }, []);

  // Fetch products when the selected category changes or search value changes
  const fetchProducts = async () => {
    if (!prodNum) return; // Don't fetch products if no category is selected
    try {
      const response = await fetch(
        `http://localhost:4000/categories/${prodNum}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch products: " + response.status);
      }
      const data = await response.json();
      const filteredProducts = data.filter((product) =>
        product.productname.toLowerCase().includes(searchValue.toLowerCase())
      );
      setProducts(filteredProducts);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodNum, searchValue]);

  const handleEditClick = (product) => {
    setProductToEdit(product);
    setShowEditModal(true);
  };

  const handleSearchInputChange = (event) => {
    setSearchValue(event.target.value);
  };

  const handleAddToCartClick = (product) => {
    setSelectedProduct(product);
    setShowPopup(true);
  };

  const handlePopupSubmit = () => {
    if (sellingPrice) {
      const productWithPrice = {
        ...selectedProduct,
        sellingPrice: parseInt(sellingPrice, 10),
      };
      dispatch(addCart(productWithPrice));
      setShowPopup(false);
      setSellingPrice("");
    }
  };

  return (
    <>
      <Helmet>
        <title>POS system</title>
        <meta
          name="description"
          content="Web site created using create-react-app"
        />
      </Helmet>
      <div className="flex flex-col items-center justify-start w-full bg-white-A700 dark:bg-gray-900 min-h-screen">
        <Header className="flex flex-row justify-between items-center w-full p-6 sm:p-5 bg-white-A700" />
        <div className="flex flex-col items-center justify-start w-full mt-[31px] gap-[51px] md:px-5 max-w-[1632px]">
          <div className="flex flex-row justify-between items-center gap-2 w-auto">
            <Link to="/" className="text-primary-600 hover:underline">
              Home
            </Link>
            <Text as="p" className="!text-blue_gray-100">
              &gt;
            </Text>
            <Text as="p" className="!text-gray-800">
              Product List
            </Text>
          </div>
          <Heading as="h1">Product List</Heading>

          <div className="relative w-96 max-w-full">
            <input
              type="text"
              value={searchValue}
              onChange={handleSearchInputChange}
              placeholder="Search products..."
              className="h-11 w-full pl-4 pr-10 border border-surface-border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 dark:text-gray-400">
              <ImSearch className="text-lg" />
            </div>
          </div>

          <div className="flex flex-row md:flex-col justify-start items-start w-full gap-8 md:gap-5">
            {/* Left Column: Categories */}
            <div className="flex flex-col items-start justify-start w-[16%] md:w-full gap-4 bg-surface-subtle dark:bg-gray-800 rounded-xl2 p-4">
              <Text as="p" className="!text-gray-800 dark:!text-gray-100 font-semibold">
                Categories
              </Text>
              <div className="flex flex-col items-start justify-start w-full gap-1">
                {categories.map((category) => {
                  const isActive = String(category.id) === String(prodNum);
                  return (
                    <Link
                      key={category.id}
                      to={`/categories/${category.id}`}
                      className={`w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-primary-50 dark:bg-gray-700 text-primary-700 dark:text-primary-300 font-medium"
                          : "text-gray-800 dark:text-gray-300 hover:bg-surface-muted dark:hover:bg-gray-700"
                      }`}
                    >
                      {category.category_name}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Products */}
            <div className="flex flex-col items-center justify-start w-[84%] md:w-full gap-[29px]">
              <div className="w-full max-h-[900px] overflow-y-auto rounded-xl2 border border-surface-border dark:border-gray-700">
                <table className="w-full border-collapse">
                  <thead className="bg-surface-subtle dark:bg-gray-800 sticky top-0">
                    <tr>
                      <th className="text-left pl-5 py-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        No
                      </th>
                      <th className="text-left py-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Product Name
                      </th>
                      <th className="text-left py-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Quantity
                      </th>
                      <th className="text-left py-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Buying Price
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                    {products
                      .filter((product) => product.quantity >= 1)
                      .map((product, index) => (
                        <tr key={product.id} className="even:bg-surface-subtle dark:even:bg-gray-800">
                          <td className="pl-5 py-3 text-gray-800 dark:text-gray-100">
                            {index + 1}.
                          </td>
                          <td className="py-3 font-medium text-gray-800 dark:text-gray-100">
                            {product.productname}
                          </td>
                          <td className="py-3 text-gray-800 dark:text-gray-100">
                            {product.quantity}
                          </td>
                          <td className="py-3 text-gray-800 dark:text-gray-100">
                            {product.buyingprice}
                          </td>
                          <td className="py-3 pr-5 text-right space-x-2 whitespace-nowrap">
                            <button
                              onClick={() => handleEditClick(product)}
                              className="px-4 py-2 bg-surface-muted dark:bg-gray-700 hover:bg-surface-border dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs font-bold uppercase rounded-lg transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleAddToCartClick(product)}
                              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white-A700 text-xs font-bold uppercase rounded-lg transition-colors"
                            >
                              Add to cart
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <Footer className="flex justify-center items-center w-full mt-[85px] p-[30px] sm:p-5 bg-gray-800" />
      </div>

      {/* Popup for selling price */}
      <Modal
        isOpen={showPopup}
        onClose={() => setShowPopup(false)}
        title="Enter Selling Price"
      >
        <input
          type="number"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
          className="bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5 mb-4"
          placeholder="Enter price"
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setShowPopup(false)}
            className="px-4 py-2 bg-surface-muted dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-surface-border dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePopupSubmit}
            className="px-4 py-2 bg-primary-600 text-white-A700 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Submit
          </button>
        </div>
      </Modal>

      <EditProductModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        product={productToEdit}
        onUpdated={fetchProducts}
      />
    </>
  );
}
