// Shared loading placeholder — a pulsing gray block. Used instead of plain "Loading..."
// text (or nothing at all) so pages show *something* shaped like the content that's about
// to arrive, rather than a blank flash.
export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-surface-muted dark:bg-gray-700 ${className}`} />;
}

// A handful of card-shaped skeletons, for pages whose loaded content is a grid of cards.
export function SkeletonCards({ count = 6 }) {
  return (
    <div className="grid grid-cols-3 gap-4 md:grid-cols-2 sm:grid-cols-1">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800"
        >
          <Skeleton className="mb-3 h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// A handful of row-shaped skeletons, for pages whose loaded content is a table.
export function SkeletonRows({ count = 6 }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
