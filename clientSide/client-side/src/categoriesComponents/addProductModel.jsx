import React, { useState, useEffect } from "react";
import { Modal } from "components";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

const AddProductModal = ({ isOpen, onClose }) => {
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevFormData) => ({
      ...prevFormData,
      [name]: value,
    }));
  };

  const handleSubmitProduct = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("http://localhost:4000/product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        if (response.status === 409)
          throw new Error("Cannot add duplicate products");
        else throw new Error("Failed to add product");
      }
      alert("Product added successfully!");
      setFormData({ name: "", buying_price: "", quantity: "", category_id: "" });
      onClose();
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Product">
      <form className="space-y-4" onSubmit={handleSubmitProduct}>
        <div>
          <label htmlFor="product_name" className={labelClass}>
            Product Name
          </label>
          <input
            type="text"
            name="name"
            id="product_name"
            value={formData.name}
            onChange={handleChange}
            className={inputClass}
            placeholder="Enter product"
            required
          />
        </div>
        <div>
          <label htmlFor="buying_price" className={labelClass}>
            Buying Price
          </label>
          <input
            type="number"
            name="buying_price"
            id="buying_price"
            value={formData.buying_price}
            placeholder="Enter buying price"
            onChange={handleChange}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="quantity" className={labelClass}>
            Quantity
          </label>
          <input
            type="number"
            name="quantity"
            id="quantity"
            value={formData.quantity}
            placeholder="Enter quantity"
            onChange={handleChange}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="category_id" className={labelClass}>
            Category
          </label>
          <select
            name="category_id"
            id="category_id"
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
          Submit
        </button>
      </form>
    </Modal>
  );
};

export default AddProductModal;
