import { useCallback, useEffect, useState } from "react";
import { HiOutlineComputerDesktop, HiOutlineDevicePhoneMobile, HiOutlineExclamationTriangle } from "react-icons/hi2";
import AppShell from "components/AppShell";
import { SkeletonRows, EmptyState } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import { apiGet, apiPatch } from "utils/api";
import { timeAgoIn } from "utils/timeAgo";

// The shop's registers (plan-offline-sync.md): each Windows PC or Android phone running the POS
// with its own database, how current it is, and what it couldn't sync. Owner-only, and web-only:
// the list lives in the cloud, not on a device.
const STATE_CLASS = {
  in_sync: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500",
  behind: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  offline_long: "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-500",
  retired: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  blocked: "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-500",
};
const CLOCK_WARN_MS = 5 * 60 * 1000;
const latest = (...values) => values.filter(Boolean).sort().pop() ?? null;

export default function Devices() {
  const { t } = useLanguage();
  const toast = useToast();
  const timeAgo = timeAgoIn(t);
  const [data, setData] = useState(null);
  const [issues, setIssues] = useState(null);

  const load = useCallback(async () => {
    try {
      const [list, rejections] = await Promise.all([apiGet("/api/devices"), apiGet("/api/devices/rejections")]);
      setData(list);
      setIssues(rejections.rejections);
    } catch (err) {
      toast.error(err.message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (device, status) => {
    const confirmKey = status === "retired" ? "devices.retireConfirm" : "devices.blockConfirm";
    if (!window.confirm(t(confirmKey, { name: device.name }))) return;
    try {
      await apiPatch(`/api/devices/${device.id}/status`, { status });
      toast.success(t(status === "retired" ? "devices.retired" : "devices.blocked", { name: device.name }));
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const resolve = async (issue) => {
    try {
      await apiPatch(`/api/devices/rejections/${issue.id}/resolve`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const active = data?.devices.filter((d) => d.status === "active").length ?? 0;

  return (
    <AppShell title={t("devices.title")}>
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <div className="rounded-2xl border border-surface-border bg-white-A700 p-5 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-300">{t("devices.intro")}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t("devices.howToAdd")}</p>
          {data && (
            <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
              {t("devices.limit", { used: active, limit: data.limit })}
            </p>
          )}
        </div>

        {!data ? (
          <SkeletonRows count={3} />
        ) : data.devices.length === 0 ? (
          <EmptyState icon={HiOutlineComputerDesktop} title={t("devices.none")} />
        ) : (
          <ul className="space-y-3">
            {data.devices.map((device) => {
              const Icon = device.platform === "android" ? HiOutlineDevicePhoneMobile : HiOutlineComputerDesktop;
              const clockOff = Math.abs(device.clock_skew_ms || 0) > CLOCK_WARN_MS;
              return (
                <li
                  key={device.id}
                  className="rounded-2xl border border-surface-border bg-white-A700 p-4 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <Icon className="mt-0.5 h-6 w-6 shrink-0 text-gray-500 dark:text-gray-400" />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 dark:text-gray-100">
                          {device.name} <span className="font-mono text-xs text-gray-500">({device.receipt_prefix})</span>
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t("devices.registeredBy", { when: timeAgo(device.registered_at), name: device.registered_by_name || "—" })}
                          {device.app_version ? ` · v${device.app_version}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_CLASS[device.sync_state]}`}>
                      {t(`devices.state.${device.sync_state}`)}
                    </span>
                  </div>

                  {device.status === "active" && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-surface-border pt-3 text-sm dark:border-gray-700">
                      <div className="space-y-0.5 text-gray-600 dark:text-gray-300">
                        <p>
                          {t("devices.lastSync")}: <strong>{timeAgo(latest(device.last_push_at, device.last_pull_at))}</strong>
                        </p>
                        {device.pending_count > 0 && (
                          <p className="text-amber-700 dark:text-amber-400">
                            {t("devices.waiting", { n: device.pending_count })}{" "}
                            <span className="text-xs text-gray-500">({t("devices.waitingAsOf")})</span>
                          </p>
                        )}
                        {clockOff && (
                          <p className="flex items-center gap-1 text-danger-600 dark:text-danger-500">
                            <HiOutlineExclamationTriangle />
                            {t("devices.clockOff", { minutes: Math.round(Math.abs(device.clock_skew_ms) / 60000) })}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => changeStatus(device, "retired")}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 ring-1 ring-surface-border hover:bg-surface-muted dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700"
                        >
                          {t("devices.retire")}
                        </button>
                        <button
                          type="button"
                          onClick={() => changeStatus(device, "blocked")}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-danger-600 ring-1 ring-danger-500/30 hover:bg-danger-50 dark:text-danger-500 dark:hover:bg-danger-500/10"
                        >
                          {t("devices.block")}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <section className="rounded-2xl border border-surface-border bg-white-A700 p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">{t("devices.issuesTitle")}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("devices.issuesIntro")}</p>
          {!issues ? null : issues.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t("devices.noIssues")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-surface-border dark:divide-gray-700">
              {issues.map((issue) => (
                <li key={issue.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-100">
                      {issue.device_name} ({issue.receipt_prefix}) · <span className="font-mono text-xs">{issue.event_type}</span>
                    </p>
                    <p className="text-gray-600 dark:text-gray-300">{issue.reason}</p>
                    <p className="text-xs text-gray-500">{timeAgo(issue.created_at)}</p>
                  </div>
                  {!issue.resolved_at && (
                    <button
                      type="button"
                      onClick={() => resolve(issue)}
                      className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white-A700 hover:bg-primary-700"
                    >
                      {t("devices.resolve")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
