import { useEffect, useState } from "react";
import { HiOutlineArrowPath, HiOutlineCheckCircle, HiOutlineSignalSlash } from "react-icons/hi2";
import useDeviceStatus, { refreshDeviceStatus } from "hooks/useDeviceStatus";
import { useLanguage } from "i18n/LanguageContext";
import { apiPost } from "utils/api";
import { timeAgoIn } from "utils/timeAgo";

const POLL_MS = 15000;

// How current a shop's own register is with the cloud (device/syncWorker.js): only shown in the
// Windows/Android app, once the device is registered. Polls the device's own status.
const useSyncState = () => {
  const initial = useDeviceStatus();
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!initial?.registered) return undefined;
    setStatus(initial);
    const timer = setInterval(() => refreshDeviceStatus().then((s) => s && setStatus(s)), POLL_MS);
    return () => clearInterval(timer);
  }, [initial]);
  return [status?.sync ?? null, setStatus];
};

export default function DeviceSyncStatus() {
  const { t } = useLanguage();
  const [sync, setStatus] = useSyncState();
  const [syncing, setSyncing] = useState(false);
  if (!sync) return null;

  const syncNow = async () => {
    setSyncing(true);
    try {
      await apiPost("/api/device/sync-now");
    } catch {
      // The status below says what went wrong.
    } finally {
      setStatus(await refreshDeviceStatus());
      setSyncing(false);
    }
  };

  const busy = syncing || sync.syncing;
  const label = busy
    ? t("deviceSync.syncing")
    : sync.online === false
    ? sync.pending > 0
      ? `${t("deviceSync.offline")} · ${t("deviceSync.waiting", { n: sync.pending })}`
      : t("deviceSync.offline")
    : sync.pending > 0
    ? t("deviceSync.waiting", { n: sync.pending })
    : t("deviceSync.synced", { when: timeAgoIn(t)(sync.lastSyncAt) });
  const healthy = !busy && sync.online !== false && sync.pending === 0;

  return (
    <button
      type="button"
      onClick={syncNow}
      disabled={busy}
      title={sync.lastError || t("deviceSync.syncNow")}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        healthy
          ? "bg-success-50 text-success-700 hover:bg-success-500/20 dark:bg-success-500/10 dark:text-success-500"
          : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400"
      }`}
    >
      {busy ? (
        <HiOutlineArrowPath className="motion-safe:animate-spin" />
      ) : healthy ? (
        <HiOutlineCheckCircle />
      ) : (
        <HiOutlineSignalSlash />
      )}
      {label}
    </button>
  );
}

// A banner when the register has been offline for days, can no longer sell, or was retired.
export function DeviceSyncNotice() {
  const { t } = useLanguage();
  const [sync] = useSyncState();
  if (!sync || !(sync.revoked || sync.warn)) return null;
  const message = sync.revoked
    ? t("deviceSync.revoked")
    : sync.blocked
    ? t("deviceSync.blocked", { days: sync.daysSinceSync })
    : t("deviceSync.warn", { days: sync.daysSinceSync });
  const danger = sync.revoked || sync.blocked;
  return (
    <div
      role="alert"
      className={`px-8 py-2.5 text-sm font-medium md:px-5 sm:px-4 ${
        danger
          ? "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-500"
          : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
      }`}
    >
      {message}
    </div>
  );
}
