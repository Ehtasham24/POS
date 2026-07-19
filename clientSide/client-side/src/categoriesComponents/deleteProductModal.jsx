import React, { useState } from "react";
import { Modal } from "components";

const DeleteProductModal = ({ isOpen, onClose }) => {
  const [deletionData, setDeletionData] = useState({
    name: "",
  });

  const handleDeletionProduct = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("http://localhost:4000/product", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(deletionData),
      });
      if (!response.ok) {
        if (response.status === 409) {
          const productName = deletionData.name;
          throw new Error(`${productName} not found!`);
        } else throw new Error("Failed to delete product");
      }
      alert("Product deleted successfully");
      setDeletionData({ name: "" });
      onClose();
    } catch (err) {
      console.error("Error deleting product:", err);
      alert(err.message);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setDeletionData((prevFormData) => ({
      ...prevFormData,
      [name]: value,
    }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Product">
      <form className="space-y-4" onSubmit={handleDeletionProduct}>
        <div>
          <label
            htmlFor="product_name"
            className="block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100"
          >
            Product Name
          </label>
          <input
            type="text"
            name="name"
            id="product_name"
            value={deletionData.name}
            onChange={handleChange}
            className="bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-danger-500 focus:border-danger-500 block w-full p-2.5"
            placeholder="Enter product"
            required
          />
        </div>

        <button
          type="submit"
          className="w-full text-white-A700 bg-danger-600 hover:bg-danger-700 focus:ring-4 focus:outline-none focus:ring-danger-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition-colors"
        >
          Delete
        </button>
      </form>
    </Modal>
  );
};

export default DeleteProductModal;
