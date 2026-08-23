import { useEffect, useState } from "react";
import { HiOutlineClock, HiOutlineBanknotes, HiOutlinePlusCircle } from "react-icons/hi2";
import AppShell from "components/AppShell";
import { SkeletonRows, EmptyState } from "components";
import { useAuth } from "auth/AuthContext";
import { useLanguage } from "i18n/LanguageContext";
import { useTimezone } from "timezone/TimezoneContext";
import { useToast } from "components/Toast/ToastContext";
import { apiGet } from "utils/api";
import OpenShiftModal from "categoriesComponents/OpenShiftModal";
import CloseShiftModal from "categoriesComponents/CloseShiftModal";
import CashMovementModal from "categoriesComponents/CashMovementModal";
import ReconcileShiftModal from "categoriesComponents/ReconcileShiftModal";

// Variance color-coding mirrors Inventory's own status-badge pattern (pages/Inventory/
// index.jsx's statusStyles) — green/amber/red for match/short/over, at a glance.
const varianceClass = (variance) => {
  const v = Number(variance);
  if (v === 0) return "text-success-600 dark:text-success-500";
  return v < 0 ? "text-danger-600 dark:text-danger-400" : "text-amber-600 dark:text-amber-400";
};

// Per-cashier shift open/close + cash-drawer reconciliation. Any logged-in staff (no roles
// restriction — see navItems.js/App.jsx) — a cashier manages their own shift, an owner sees
// and can act on everyone's (Sevices/shiftService.js's self-vs-owner scoping, same shape
// voidSale already established for sales).
const filterInputClass =
  "h-10 rounded-xl border border-surface-border bg-surface-subtle px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

export default function ShiftsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { formatDateTime } = useTimezone();
  const toast = useToast();
  const isOwner = user?.role === "owner";

  const [currentShift, setCurrentShift] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [reconcileItem, setReconcileItem] = useState(null);

  // Filters — startDate/endDate/status/userId/onlyVariance/minVariance/maxVariance are all
  // handled server-side (Sevices/shiftService.js's listShifts), not filtered client-side, so
  // a large history stays fast to query. userId/variance-range are owner-only in the UI since
  // a cashier is already pinned to their own shifts server-side regardless.
  const [users, setUsers] = useState([]);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterUserId, setFilterUserId] = useState("all");
  const [filterOnlyVariance, setFilterOnlyVariance] = useState(false);
  const [filterMinVariance, setFilterMinVariance] = useState("");
  const [filterMaxVariance, setFilterMaxVariance] = useState("");

  const fetchCurrentShift = async () => {
    try {
      setCurrentShift(await apiGet("/api/shifts/current"));
    } catch (error) {
      toast.error(error.message || "Couldn't load your current shift.");
    }
  };

  const fetchHistory = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStartDate) params.set("startDate", filterStartDate);
      if (filterEndDate) params.set("endDate", filterEndDate);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (isOwner && filterUserId !== "all") params.set("userId", filterUserId);
      if (filterOnlyVariance) params.set("onlyVariance", "true");
      if (filterMinVariance !== "") params.set("minVariance", filterMinVariance);
      if (filterMaxVariance !== "") params.set("maxVariance", filterMaxVariance);
      const query = params.toString();
      setHistory(await apiGet(`/api/shifts${query ? `?${query}` : ""}`));
    } catch (error) {
      toast.error(error.message || "Couldn't load shift history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentShift();
    if (isOwner) {
      apiGet("/api/users")
        .then(setUsers)
        .catch((error) => console.error("Error fetching users:", error));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStartDate, filterEndDate, filterStatus, filterUserId, filterOnlyVariance, filterMinVariance, filterMaxVariance]);

  // Both the "current shift" card and the history table below need to refresh after any
  // action (open/close/reconcile) — kept as one helper so every modal's onXxx callback below
  // doesn't need to know which of the two actually changed.
  const refreshAll = () => {
    fetchCurrentShift();
    fetchHistory();
  };

  return (
    <AppShell title={t("shifts.title")}>
      <div className="max-w-4xl">
        {!loading && (
          <div className="mb-6 rounded-2xl border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
            {currentShift ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
                    <HiOutlineClock className="text-xl text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("shifts.currentShift")}</p>
                    <p className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                      PKR {Number(currentShift.opening_float).toFixed(0)} · {t("shifts.openedAt")}{" "}
                      {formatDateTime(currentShift.opened_at, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMovementModalOpen(true)}
                    className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-surface-subtle dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    {t("shifts.recordCashMovement")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCloseModalOpen(true)}
                    className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700"
                  >
                    {t("shifts.closeShift")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted dark:bg-gray-700">
                    <HiOutlineBanknotes className="text-xl text-gray-500 dark:text-gray-400" />
                  </div>
                  <p className="font-poppins text-lg font-semibold text-gray-600 dark:text-gray-300">
                    {t("shifts.noOpenShift")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenModalOpen(true)}
                  className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white-A700 transition-colors hover:bg-primary-700"
                >
                  <HiOutlinePlusCircle className="text-base" />
                  {t("shifts.openShift")}
                </button>
              </div>
            )}
          </div>
        )}

        <p className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">{t("shifts.history")}</p>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className={filterInputClass}
          />
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className={filterInputClass}
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={filterInputClass}>
            <option value="all">{t("shifts.filterAllStatuses")}</option>
            <option value="open">{t("shifts.statusOpen")}</option>
            <option value="closed">{t("shifts.statusClosed")}</option>
          </select>
          {isOwner && (
            <select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)} className={filterInputClass}>
              <option value="all">{t("shifts.filterAllUsers")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          )}
          {isOwner && (
            <label className="flex h-10 items-center gap-2 rounded-xl border border-surface-border bg-surface-subtle px-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <input
                type="checkbox"
                checked={filterOnlyVariance}
                onChange={(e) => setFilterOnlyVariance(e.target.checked)}
                className="h-4 w-4 rounded border-surface-border text-primary-600 focus:ring-primary-500"
              />
              {t("shifts.filterOnlyVariance")}
            </label>
          )}
          {isOwner && (
            <>
              <input
                type="number"
                value={filterMinVariance}
                onChange={(e) => setFilterMinVariance(e.target.value)}
                placeholder={t("shifts.filterMinVariance")}
                className={`${filterInputClass} w-32`}
              />
              <input
                type="number"
                value={filterMaxVariance}
                onChange={(e) => setFilterMaxVariance(e.target.value)}
                placeholder={t("shifts.filterMaxVariance")}
                className={`${filterInputClass} w-32`}
              />
            </>
          )}
        </div>
        <div className="overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed border-collapse">
              <thead className="bg-surface-subtle dark:bg-gray-800">
                <tr>
                  {isOwner && (
                    <th className="w-32 text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {t("shifts.openedBy")}
                    </th>
                  )}
                  <th className="w-36 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("shifts.openedAt")}
                  </th>
                  <th className="w-36 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("shifts.closedAt")}
                  </th>
                  <th className="w-24 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("shifts.openingFloat")}
                  </th>
                  <th className="w-28 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("shifts.expectedCash")}
                  </th>
                  <th className="w-28 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("shifts.countedCash")}
                  </th>
                  <th className="w-24 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("shifts.variance")}
                  </th>
                  <th className="w-28 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("shifts.status")}
                  </th>
                  <th className="w-28 px-2 py-3"></th>
                </tr>
              </thead>
              {loading ? (
                <tbody>
                  <tr>
                    <td colSpan={isOwner ? 9 : 8}>
                      <SkeletonRows count={3} />
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody className="divide-y divide-surface-border dark:divide-gray-800">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={isOwner ? 9 : 8} className="py-2">
                        <EmptyState icon={HiOutlineClock} title={t("shifts.noHistory")} />
                      </td>
                    </tr>
                  ) : (
                    history.map((shift) => {
                      const needsReview = shift.auto_closed && shift.counted_cash == null;
                      const canReconcile = needsReview && (isOwner || shift.opened_by === user?.id);
                      return (
                        <tr key={shift.id} className="transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60">
                          {isOwner && (
                            <td className="truncate px-3 py-3 text-gray-800 dark:text-gray-100">
                              {shift.opened_by_name || "—"}
                            </td>
                          )}
                          <td className="truncate px-2 py-3 text-gray-600 dark:text-gray-300">
                            {formatDateTime(shift.opened_at, { dateStyle: "medium", timeStyle: "short" })}
                          </td>
                          <td className="truncate px-2 py-3 text-gray-600 dark:text-gray-300">
                            {shift.closed_at
                              ? formatDateTime(shift.closed_at, { dateStyle: "medium", timeStyle: "short" })
                              : "—"}
                          </td>
                          <td className="px-2 py-3 text-gray-800 dark:text-gray-100">
                            PKR {Number(shift.opening_float).toFixed(0)}
                          </td>
                          <td className="px-2 py-3 text-gray-800 dark:text-gray-100">
                            {shift.expected_cash != null ? `PKR ${Number(shift.expected_cash).toFixed(0)}` : "—"}
                          </td>
                          <td className="px-2 py-3 text-gray-800 dark:text-gray-100">
                            {shift.counted_cash != null ? `PKR ${Number(shift.counted_cash).toFixed(0)}` : "—"}
                          </td>
                          <td className={`px-2 py-3 font-semibold ${shift.variance != null ? varianceClass(shift.variance) : ""}`}>
                            {shift.variance != null ? `PKR ${Number(shift.variance).toFixed(0)}` : "—"}
                          </td>
                          <td className="px-2 py-3">
                            {needsReview ? (
                              <span className="inline-flex rounded-full bg-danger-50 px-2.5 py-1 text-xs font-semibold text-danger-600 dark:bg-danger-500/10 dark:text-danger-400">
                                {t("shifts.statusNeedsReview")}
                              </span>
                            ) : (
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  shift.status === "open"
                                    ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                                    : "bg-surface-muted text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                }`}
                              >
                                {shift.status === "open" ? t("shifts.statusOpen") : t("shifts.statusClosed")}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            {canReconcile && (
                              <button
                                type="button"
                                onClick={() => setReconcileItem(shift)}
                                className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-surface-subtle dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                              >
                                {t("shifts.reconcile")}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              )}
            </table>
          </div>
        </div>
      </div>

      <OpenShiftModal
        isOpen={openModalOpen}
        onClose={() => setOpenModalOpen(false)}
        onOpened={() => {
          setOpenModalOpen(false);
          refreshAll();
        }}
      />
      {currentShift && (
        <>
          <CloseShiftModal
            isOpen={closeModalOpen}
            onClose={() => setCloseModalOpen(false)}
            shiftId={currentShift.id}
            onClosed={() => {
              setCloseModalOpen(false);
              refreshAll();
            }}
          />
          <CashMovementModal
            isOpen={movementModalOpen}
            onClose={() => setMovementModalOpen(false)}
            shiftId={currentShift.id}
            onRecorded={() => setMovementModalOpen(false)}
          />
        </>
      )}

      <ReconcileShiftModal
        isOpen={!!reconcileItem}
        onClose={() => setReconcileItem(null)}
        shift={reconcileItem}
        onReconciled={() => {
          setReconcileItem(null);
          refreshAll();
        }}
      />
    </AppShell>
  );
}
