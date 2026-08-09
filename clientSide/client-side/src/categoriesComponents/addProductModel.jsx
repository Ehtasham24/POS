import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";
import { apiGet, apiPost } from "utils/api";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

const initialFormData = {
  name: "",
  buying_price: "",
  quantity: "",
  category_id: "",
  vendor_id: "",
};

const AddProductModal = ({ isOpen, onClose }) => {
  const toast = useToast();
  const [formData, setFormData] = useState(initialFormData);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [batchTracked, setBatchTracked] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchCategories = async () => {
      try {
        setCategories(await apiGet("/categories"));
      } catch (error) {
        console.error("Error fetching categories:", error);
        toast.error("Couldn't load categories — check your connection and try again.");
      }
    };
    const fetchVendors = async () => {
      try {
        setVendors(await apiGet("/api/contacts?type=vendor"));
      } catch (error) {
        console.error("Error fetching vendors:", error);
        toast.error("Couldn't load vendors — check your connection and try again.");
      }
    };
    fetchCategories();
    fetchVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevFormData) => ({
      ...prevFormData,
      [name]: value,
    }));
  };

  const handleSubmitProduct = async (e) => {
    e.preventDefault();
    if (batchTracked && !formData.vendor_id) {
      toast.error("Select a vendor for this lot");
      return;
    }
    try {
      const data = await apiPost("/product", {
        ...formData,
        batch_tracked: batchTracked,
      });
      if (data.lot) {
        toast.success(`Product added! First lot: ${data.lot.lot_code}`);
      } else {
        toast.success("Product added successfully!");
      }
      setFormData(initialFormData);
      setBatchTracked(false);
      onClose();
    } catch (error) {
      toast.error(error.message);
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

        <label className="flex items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2.5 text-sm font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-100">
          <input
            type="checkbox"
            checked={batchTracked}
            onChange={(e) => setBatchTracked(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          Track by lot/batch (different buying prices over time)
        </label>

        {batchTracked && (
          <div>
            <label htmlFor="vendor_id" className={labelClass}>
              Vendor (this lot's supplier)
            </label>
            <select
              name="vendor_id"
              id="vendor_id"
              onChange={handleChange}
              value={formData.vendor_id}
              className={inputClass}
              required={batchTracked}
            >
              <option value="" disabled>
                Select vendor
              </option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
            {vendors.length === 0 && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                No vendors yet —{" "}
                <Link to="/contacts" className="text-primary-600 hover:underline">
                  add one first
                </Link>
                .
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              The lot code is generated automatically from the vendor and product.
            </p>
          </div>
        )}

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
            min="0"
            step="0.01"
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
            min="0"
            step="1"
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
