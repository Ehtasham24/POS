import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineInformationCircle,
  HiOutlineExclamationTriangle,
  HiOutlineXMark,
} from "react-icons/hi2";

const ToastContext = createContext(null);

const icons = {
  success: HiOutlineCheckCircle,
  error: HiOutlineXCircle,
  info: HiOutlineInformationCircle,
  warning: HiOutlineExclamationTriangle,
};

const styles = {
  success: "border-success-500/30 bg-white-A700 dark:bg-gray-800 text-success-600 dark:text-success-500",
  error: "border-danger-500/30 bg-white-A700 dark:bg-gray-800 text-danger-600 dark:text-danger-400",
  info: "border-primary-500/30 bg-white-A700 dark:bg-gray-800 text-primary-600 dark:text-primary-400",
  warning: "border-amber-500/30 bg-white-A700 dark:bg-gray-800 text-amber-600 dark:text-amber-400",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message, type = "info") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  const toast = {
    success: (message) => show(message, "success"),
    error: (message) => show(message, "error"),
    info: (message) => show(message, "info"),
    warning: (message) => show(message, "warning"),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 sm:left-4 sm:right-4 sm:max-w-none">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white-A700 p-4 shadow-modal animate-[toast-in_0.2s_ease-out] dark:border-gray-700 ${styles[t.type]}`}
            >
              <Icon className="mt-0.5 shrink-0 text-xl" />
              <p className="flex-1 whitespace-pre-line text-sm font-medium text-gray-800 dark:text-gray-100">
                {t.message}
              </p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <HiOutlineXMark className="text-lg" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
