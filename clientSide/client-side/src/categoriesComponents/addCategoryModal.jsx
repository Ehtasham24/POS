import React, { useState } from "react";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";

const AddCategoryModal = ({ isOpen, onClose, onCategoryAdded }) => {
  const toast = useToast();
  const [categoryName, setCategoryName] = useState("");

  const handleChange = (e) => {
    setCategoryName(e.target.value);
  };

  const handleSubmitCategory = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("http://localhost:4000/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category_name: categoryName }),
      });
      if (!response.ok) {
        if (response.status === 409)
          throw new Error("Category already exists");
        else throw new Error("Failed to add category");
      }
      toast.success("Category added successfully!");
      setCategoryName("");
      onCategoryAdded();
      onClose();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Category">
      <form className="space-y-4" onSubmit={handleSubmitCategory}>
        <div>
          <label
            htmlFor="category_name"
            className="block mb-1 text-sm font-semibold text-gray-800"
          >
            Category Name
          </label>
          <input
            type="text"
            name="category_name"
            id="category_name"
            value={categoryName}
            onChange={handleChange}
            className="bg-white-A700 border border-surface-border mt-2 text-gray-900 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5"
            placeholder="Enter category name"
            required
          />
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

export default AddCategoryModal;
