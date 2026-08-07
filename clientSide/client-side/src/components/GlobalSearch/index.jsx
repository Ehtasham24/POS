import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineMagnifyingGlass, HiOutlineCube } from "react-icons/hi2";
import useDebounce from "hooks/useDebounce";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 250);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `http://localhost:4000/api/search?q=${encodeURIComponent(trimmed)}`
        );
        const data = await response.json();
        if (!cancelled) {
          setResults(data);
          setIsOpen(true);
        }
      } catch (error) {
        console.error("Error searching:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (result) => {
    setIsOpen(false);
    setQuery("");
    navigate(`/categories/${result.category_id}`);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xs sm:max-w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search by name or lot no..."
          className="h-10 w-full rounded-xl border border-surface-border bg-surface-subtle pl-9 pr-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <HiOutlineMagnifyingGlass className="pointer-events-none absolute inset-y-0 left-3 my-auto text-lg text-gray-500 dark:text-gray-400" />
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-surface-border bg-white-A700 shadow-modal dark:border-gray-700 dark:bg-gray-800">
          <ul className="max-h-80 overflow-y-auto">
            {results.map((result) => (
              <li key={`${result.product_id}-${result.lot_id || ""}`}>
                <button
                  type="button"
                  onClick={() => handleSelect(result)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-subtle dark:hover:bg-gray-700"
                >
                  <HiOutlineCube className="shrink-0 text-lg text-primary-600 dark:text-primary-400" />
                  <span className="flex-1 truncate font-medium text-gray-800 dark:text-gray-100">
                    {result.productname}
                  </span>
                  {result.matched_lot_code && (
                    <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                      {result.matched_lot_code}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOpen && query.trim() && results.length === 0 && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[90vw] rounded-xl border border-surface-border bg-white-A700 px-4 py-3 text-sm text-gray-500 shadow-modal dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          No matches found.
        </div>
      )}
    </div>
  );
}
