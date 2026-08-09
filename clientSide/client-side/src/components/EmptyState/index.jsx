// Shared "nothing here yet" placeholder — icon + message in a dashed card. Matches the
// pattern already used on the Contacts page; standardized here so every list/table view
// looks the same instead of some showing a plain text row and others a real empty state.
export default function EmptyState({ icon: Icon, title, className = "" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-surface-border py-16 text-center dark:border-gray-700 ${className}`}
    >
      {Icon && <Icon className="text-4xl text-gray-400" />}
      <p className="text-gray-500 dark:text-gray-400">{title}</p>
    </div>
  );
}
