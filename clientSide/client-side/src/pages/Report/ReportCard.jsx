// The one card shell every Sales Report section uses (breakdown, shrinkage, products), so
// they all share the same border, header and spacing. `actions` sits on the header's right
// (tabs, filters) and is left off the printout. `avoidBreak` keeps a short card on one
// printed page; a long one (the product table) must be allowed to run across pages.
export default function ReportCard({ title, actions, className = "mb-6", avoidBreak = true, children }) {
  return (
    <section
      className={`${avoidBreak ? "print-avoid-break" : ""} overflow-hidden rounded-2xl border border-surface-border bg-white-A700 shadow-card dark:border-gray-800 dark:bg-gray-900 ${className}`}
    >
      <div className="flex min-h-[4rem] flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-3 dark:border-gray-800">
        <h3 className="flex items-center gap-1.5 font-poppins text-base font-bold text-gray-800 dark:text-gray-100">{title}</h3>
        {actions && <div className="screen-only flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

// Pill toggle used for the report's choices (date presets, breakdown tabs) — one look for both.
export const chipClass = (active) =>
  `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-primary-600 text-white-A700"
      : "bg-surface-muted text-gray-700 hover:bg-surface-border dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
  }`;
