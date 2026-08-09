import { HiOutlineSignalSlash, HiOutlineArrowPath } from "react-icons/hi2";
import useOfflineStatus from "hooks/useOfflineStatus";

// Shows nothing when online and fully synced — only surfaces when there's something the
// cashier should know about (offline, or a queued sale still waiting to sync).
export default function OfflineStatusBadge() {
  const { online, syncing, pendingCount } = useOfflineStatus();

  if (online && pendingCount === 0) return null;

  const label = !online
    ? pendingCount > 0
      ? `Offline — ${pendingCount} sale${pendingCount === 1 ? "" : "s"} pending`
      : "Offline"
    : syncing
    ? "Syncing..."
    : `${pendingCount} sale${pendingCount === 1 ? "" : "s"} pending`;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
      title={!online ? "No connection — sales are being saved locally" : "Syncing queued sales to the server"}
    >
      {online && syncing ? (
        <HiOutlineArrowPath className="animate-spin" />
      ) : (
        <HiOutlineSignalSlash />
      )}
      {label}
    </span>
  );
}
