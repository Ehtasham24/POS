import React, { useState, useEffect } from "react";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

const EditProductModal = ({ isOpen, onClose, product, onUpdated }) => {
  const toast = useToast();
  const [formData, setFormData] = useState({
    name: "",
    buying_price: "",
    quantity: "",
    category_id: "",
  });
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch("http://localhost:4000/categories");
        const data = await response.json();
        setCategories(data);
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.productname || "",
        buying_price: product.buyingprice ?? "",
        quantity: product.quantity ?? "",
        category_id: product.category_id ?? "",
      });
    }
  }, [product]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevFormData) => ({
      ...prevFormData,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(
        `http://localhost:4000/products/${product.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: formData.name,
            // Batch-tracked products keep their real price/quantity in `lots` — editing
            // those here would desync them, so only name/category are sent for those.
            price: product.batch_tracked ? product.buyingprice : formData.buying_price,
            Quantity: product.batch_tracked ? product.quantity : formData.quantity,
            Category_id: formData.category_id,
          }),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to update product");
      }
      toast.success("Product updated successfully!");
      onUpdated();
      onClose();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Product">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="edit_product_name" className={labelClass}>
            Product Name
          </label>
          <input
            type="text"
            name="name"
            id="edit_product_name"
            value={formData.name}
            onChange={handleChange}
            className={inputClass}
            placeholder="Enter product"
            required
          />
        </div>
        {product?.batch_tracked ? (
          <p className="rounded-lg bg-surface-subtle px-3 py-2.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            This product is lot-tracked — price and quantity come from its lots. Use
            "Update" &rarr; lots to manage stock and pricing.
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="edit_buying_price" className={labelClass}>
                Buying Price
              </label>
              <input
                type="number"
                name="buying_price"
                id="edit_buying_price"
                value={formData.buying_price}
                placeholder="Enter buying price"
                onChange={handleChange}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor="edit_quantity" className={labelClass}>
                Quantity
              </label>
              <input
                type="number"
                name="quantity"
                id="edit_quantity"
                value={formData.quantity}
                placeholder="Enter quantity"
                onChange={handleChange}
                className={inputClass}
                required
              />
            </div>
          </>
        )}
        <div>
          <label htmlFor="edit_category_id" className={labelClass}>
            Category
          </label>
          <select
            name="category_id"
            id="edit_category_id"
            onChange={handleChange}
            value={formData.category_id}
            className={inputClass}
            required
          >
            <option value="" disabled>
              Select category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.category_name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="w-full text-white-A700 bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition-colors"
        >
          Save Changes
        </button>
      </form>
    </Modal>
  );
};

export default EditProductModal;
