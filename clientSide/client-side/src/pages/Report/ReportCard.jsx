// The one card shell every Sales Report section uses (charts, breakdown, shrinkage,
// products), so they all share the same border, header and spacing. `actions` sits on the
// header's right (tabs, filters) and is left off the printout. `avoidBreak` keeps a short
// card on one printed page; a long one (a table) must be allowed to run across pages.
// On paper a card drops its box and becomes a titled section with a rule under the title —
// a box around a table that runs over several pages prints as open-ended fragments.
export default function ReportCard({ title, actions, className = "mb-6", avoidBreak = true, children }) {
  return (
    <section
      className={`${avoidBreak ? "print-avoid-break" : ""} overflow-hidden rounded-2xl border border-surface-border bg-white-A700 shadow-card dark:border-gray-800 dark:bg-gray-900 printing:overflow-visible printing:rounded-none printing:border-0 printing:shadow-none ${className}`}
    >
      <div className="flex min-h-[4rem] flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-3 dark:border-gray-800 printing:min-h-0 printing:break-after-avoid printing:border-b-2 printing:border-gray-800 printing:px-1.5 printing:py-2">
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
