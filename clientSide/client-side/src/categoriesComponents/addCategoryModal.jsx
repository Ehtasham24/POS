import React, { useState } from "react";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";
import { apiPost } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

const AddCategoryModal = ({ isOpen, onClose, onCategoryAdded }) => {
  const toast = useToast();
  const [categoryName, setCategoryName] = useState("");

  const handleChange = (e) => {
    setCategoryName(e.target.value);
  };

  const handleSubmitCategory = async (e) => {
    e.preventDefault();
    try {
      await apiPost("/categories", { category_name: categoryName });
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
          <label htmlFor="category_name" className={labelClass}>
            Category Name
          </label>
          <input
            type="text"
            name="category_name"
            id="category_name"
            value={categoryName}
            onChange={handleChange}
            className={inputClass}
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
