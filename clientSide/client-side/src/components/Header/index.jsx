import React from "react";
import { Heading } from "components";
import { Link } from "react-router-dom";
import {
  HiOutlineBuildingStorefront,
  HiOutlineSun,
  HiOutlineMoon,
} from "react-icons/hi2";
import useTheme from "hooks/useTheme";

export default function Header({ className = "", ...props }) {
  const [theme, toggleTheme] = useTheme();

  return (
    <header
      {...props}
      className={`sticky top-0 z-30 border-b border-surface-border dark:border-gray-700 dark:bg-gray-900 shadow-sm ${className}`}
    >
      <div className="flex flex-row justify-between items-center gap-16 md:flex-col md:items-start md:gap-3">
        <div className="flex flex-row justify-start items-center ml-[120px] gap-2 md:ml-5">
          <HiOutlineBuildingStorefront className="text-2xl text-primary-600" />
          <Link to="/">
            <Heading size="xs" as="h4" className="!text-primary-700">
              POS system
            </Heading>
          </Link>
        </div>
        <nav className="flex flex-row items-center gap-6 mr-[120px] md:mr-5 md:ml-5 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Link to="/sales-history" className="hover:text-primary-600">
            Sales History
          </Link>
          <Link to="/credit-debit" className="hover:text-primary-600">
            Credit/Debit
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-surface-muted dark:hover:bg-gray-800 transition-colors"
          >
            {theme === "dark" ? (
              <HiOutlineSun className="text-lg" />
            ) : (
              <HiOutlineMoon className="text-lg" />
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}
