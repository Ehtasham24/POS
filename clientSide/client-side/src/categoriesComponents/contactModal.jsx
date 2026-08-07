import React, { useEffect, useState } from "react";
import { Modal } from "components";
import { useToast } from "components/Toast/ToastContext";

const inputClass =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const labelClass = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

const emptyForm = {
  name: "",
  is_customer: false,
  is_vendor: false,
  phone: "",
  email: "",
  address: "",
};

export default function ContactModal({ isOpen, onClose, contact, onSaved }) {
  const toast = useToast();
  const [formData, setFormData] = useState(emptyForm);
  const isEditing = !!contact;

  useEffect(() => {
    if (!isOpen) return;
    setFormData(contact ? { ...emptyForm, ...contact } : emptyForm);
  }, [isOpen, contact]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.is_customer && !formData.is_vendor) {
      toast.error("Select at least one: customer or vendor");
      return;
    }
    try {
      const url = isEditing
        ? `http://localhost:4000/api/contacts/${contact.id}`
        : "http://localhost:4000/api/contacts";
      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error("Failed to save contact");
      toast.success(isEditing ? "Contact updated!" : "Contact added!");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit Contact" : "Add Contact"}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="contact_name" className={labelClass}>
            Name
          </label>
          <input
            type="text"
            name="name"
            id="contact_name"
            value={formData.name}
            onChange={handleChange}
            className={inputClass}
            placeholder="Contact name"
            required
          />
        </div>

        <div className="flex gap-4 text-sm text-gray-700 dark:text-gray-300">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_customer" checked={formData.is_customer} onChange={handleChange} />
            Customer
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_vendor" checked={formData.is_vendor} onChange={handleChange} />
            Vendor
          </label>
        </div>

        <div>
          <label htmlFor="contact_phone" className={labelClass}>
            Phone
          </label>
          <input
            type="text"
            name="phone"
            id="contact_phone"
            value={formData.phone || ""}
            onChange={handleChange}
            className={inputClass}
            placeholder="Optional"
          />
        </div>
        <div>
          <label htmlFor="contact_email" className={labelClass}>
            Email
          </label>
          <input
            type="email"
            name="email"
            id="contact_email"
            value={formData.email || ""}
            onChange={handleChange}
            className={inputClass}
            placeholder="Optional"
          />
        </div>
        <div>
          <label htmlFor="contact_address" className={labelClass}>
            Address
          </label>
          <input
            type="text"
            name="address"
            id="contact_address"
            value={formData.address || ""}
            onChange={handleChange}
            className={inputClass}
            placeholder="Optional"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white-A700 transition-colors hover:bg-primary-700"
        >
          {isEditing ? "Save Changes" : "Add Contact"}
        </button>
      </form>
    </Modal>
  );
}
