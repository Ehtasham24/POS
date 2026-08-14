import { HiChevronLeft, HiChevronRight } from "react-icons/hi2";

// Windowed page numbers with ellipses, e.g. 1 ... 4 5 [6] 7 8 ... 12
// Extracted from pages/SalesHistory/index.jsx — PartyHistoryRow (Credit/Debit) is the
// second caller, so this moved out to a shared component rather than getting duplicated.
const getPageNumbers = (current, total) => {
  const pages = [];
  const window = 1;
  const add = (p) => pages.push(p);

  add(1);
  if (current - window > 2) add("...");
  for (let p = Math.max(2, current - window); p <= Math.min(total - 1, current + window); p++) {
    add(p);
  }
  if (current + window < total - 1) add("...");
  if (total > 1) add(total);

  return pages;
};

// Purely the prev/page-numbers/next button row — callers own their own count summary text
// and the decision of whether to render this at all (e.g. only when totalCount > 0).
export default function Pagination({ page, totalPages, onPageChange, loading }) {
  const goToPage = (p) => {
    if (p < 1 || p > totalPages || p === page) return;
    onPageChange(p);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => goToPage(page - 1)}
        disabled={page <= 1 || loading}
        className="p-2 rounded-lg border border-surface-border dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-surface-subtle dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Previous page"
      >
        <HiChevronLeft />
      </button>
      {getPageNumbers(page, totalPages).map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-2 text-gray-400 select-none">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => goToPage(p)}
            disabled={loading}
            className={`min-w-[2.25rem] px-2 py-2 text-sm font-semibold rounded-lg transition-colors ${
              p === page
                ? "bg-primary-600 text-white-A700"
                : "border border-surface-border dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-surface-subtle dark:hover:bg-gray-800"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => goToPage(page + 1)}
        disabled={page >= totalPages || loading}
        className="p-2 rounded-lg border border-surface-border dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-surface-subtle dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Next page"
      >
        <HiChevronRight />
      </button>
    </div>
  );
}
