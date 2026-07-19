import React, { useEffect } from "react";
import { HiOutlineX } from "react-icons/hi";

const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-md" }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-gray-800/50 transition-opacity"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${maxWidth} bg-white-A700 dark:bg-gray-800 rounded-xl2 shadow-modal max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border dark:border-gray-700">
          <h3
            id="modal-title"
            className="text-xl font-semibold text-gray-800 dark:text-gray-100 font-poppins"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-gray-500 dark:text-gray-400 hover:bg-surface-muted dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 rounded-lg w-9 h-9 inline-flex items-center justify-center transition-colors"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

export { Modal };
