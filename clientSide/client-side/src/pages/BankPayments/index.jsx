import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineQrCode, HiOutlineExclamationTriangle } from "react-icons/hi2";
import AppShell from "components/AppShell";
import { SkeletonRows, EmptyState, PaymentMediumSummary } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { useTimezone } from "timezone/TimezoneContext";
import { apiGet, apiPatch } from "utils/api";
import BankTransferQrModal from "categoriesComponents/BankTransferQrModal";

const STATUS_BADGE_CLASS = {
  awaiting_payment: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  confirmed: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500",
  cancelled: "bg-surface-muted text-gray-500 dark:bg-gray-700 dark:text-gray-400",
  ambiguous: "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400",
};

// Fixed "all time" range for this page's PaymentMediumSummary — unlike the Sales Report
// (which has its own date picker), this is a snapshot page, so there's no selected range
// to reuse; a date far enough in the past covers every real sale this app could have.
const ALL_TIME_START = "2000-01-01T00:00";
const allTimeEnd = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// A pending bank-transfer sale has no sales/sale_transactions rows yet (see
// ExpressBackend/Sevices/bankPaymentService.js's createIntent), so it structurally can't
// show up in Sales History (built entirely on those tables) — this page is where it lives
// until it's confirmed or cancelled. Any logged-in staff, not Owner-only — same trust level
// as refunds and as this page's own routes (Routes/API/bankPaymentRoutes.js).
//
// Broadened from a bank-transfer-only page to a Payment Mediums overview: the summary cards
// above cover all 3 mediums (cash/card/bank transfer) and link into Sales History, already
// the real per-sale ledger — this page doesn't duplicate that table, it's a lens onto it.
export default function BankPaymentsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { formatDateTime } = useTimezone();
  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState(null);
  // The clicked row's own intent (already fetched, qrDataUrl included via
  // bankPaymentService.js's withReference) — reopens the exact same BankTransferQrModal
  // used at checkout, so a cashier can re-show a customer their QR without a new request.
  const [viewingIntent, setViewingIntent] = useState(null);
  // Whether the phone-based notification forwarder (PaymentNotificationForwarder/, see
  // its README) has checked in recently — surfaced here rather than silently doing
  // nothing when the phone dies/loses WiFi/loses notification access, since automatic
  // confirmation stopping is otherwise invisible until someone notices a payment sitting
  // unconfirmed far longer than usual.
  const [forwarderStatus, setForwarderStatus] = useState(null);

  const fetchIntents = async () => {
    try {
      const data = await apiGet("/api/bank-payments/intents");
      setIntents(data);
    } catch (error) {
      console.error("Error fetching bank payments:", error);
      toast.error("Couldn't load bank payments — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchForwarderStatus = async () => {
    try {
      setForwarderStatus(await apiGet("/api/bank-payments/webhook/status"));
    } catch (error) {
      console.error("Error fetching forwarder status:", error);
    }
  };

  useEffect(() => {
    fetchIntents();
    fetchForwarderStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusLabel = (status) =>
    ({
      awaiting_payment: t("paymentMediums.statusAwaiting"),
      confirmed: t("paymentMediums.statusConfirmed"),
      cancelled: t("paymentMediums.statusCancelled"),
      ambiguous: t("paymentMediums.statusAmbiguous"),
    }[status] || status);

  const handleConfirm = async (id) => {
    setActioningId(id);
    try {
      await apiPatch(`/api/bank-payments/intents/${id}/confirm`);
      toast.success(t("paymentMediums.paidToast"));
      await fetchIntents();
    } catch (error) {
      toast.error(error.message || t("paymentMediums.confirmError"));
      await fetchIntents(); // last_confirm_error is now set server-side — refresh to show it
    } finally {
      setActioningId(null);
    }
  };

  const handleCancel = async (id) => {
    const reason = window.prompt(t("paymentMediums.cancelReasonPrompt"), "");
    if (reason === null) return; // cashier backed out of the prompt itself
    setActioningId(id);
    try {
      await apiPatch(`/api/bank-payments/intents/${id}/cancel`, { reason: reason || undefined });
      toast.success(t("paymentMediums.cancelledToast"));
      await fetchIntents();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setActioningId(null);
    }
  };

  const handleRequeue = async (id) => {
    setActioningId(id);
    try {
      await apiPatch(`/api/bank-payments/intents/${id}/requeue`);
      await fetchIntents();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setActioningId(null);
    }
  };

  const pendingCount = intents.filter((i) => i.status === "awaiting_payment" || i.status === "ambiguous").length;

  return (
    <AppShell title={t("paymentMediums.title")}>
      <div className="max-w-5xl">
        <PaymentMediumSummary
          startDate={ALL_TIME_START}
          endDate={allTimeEnd()}
          onMediumClick={(medium) => navigate(`/sales-history?paymentMethod=${medium}`)}
        />

        <p className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
          {t("paymentMediums.pendingSectionTitle")}
        </p>

        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
            <HiOutlineQrCode className="text-xl text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("paymentMediums.statusAwaiting")}</p>
            <p className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">{pendingCount}</p>
          </div>
        </div>

        {/* Only shown once the phone forwarder has checked in at least once — a shop not
            using that optional feature at all should never see a "disconnected" warning
            for something it never set up. */}
        {forwarderStatus?.lastHeartbeatAt && forwarderStatus.isStale && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
            <HiOutlineExclamationTriangle className="mt-0.5 shrink-0 text-lg" />
            <div>
              <p className="font-semibold">{t("paymentMediums.forwarderStale")}</p>
              <p className="mt-0.5 text-xs opacity-90">
                {t("paymentMediums.forwarderLastSeen")}:{" "}
                {formatDateTime(forwarderStatus.lastHeartbeatAt, { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
          <div className="overflow-x-auto">
            {/* min-w raised and the actions column given an explicit width — same fix
                SalesHistory's own expanded-items table already needed once it grew a
                second action button (Void + Refund): two buttons ("Mark as Paid" +
                "Cancel") don't fit in table-fixed's leftover space without one. */}
            <table className="w-full min-w-[820px] table-fixed border-collapse">
              <thead className="bg-surface-subtle dark:bg-gray-800">
                <tr>
                  <th className="w-36 text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("paymentMediums.reference")}
                  </th>
                  <th className="w-32 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("paymentMediums.amount")}
                  </th>
                  <th className="w-44 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("paymentMediums.created")}
                  </th>
                  <th className="w-36 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("paymentMediums.status")}
                  </th>
                  <th className="w-56 px-2 py-3"></th>
                </tr>
              </thead>
              {loading ? (
                <tbody>
                  <tr>
                    <td colSpan={5}>
                      <SkeletonRows count={3} />
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody className="divide-y divide-surface-border dark:divide-gray-800">
                  {intents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-2">
                        <EmptyState icon={HiOutlineQrCode} title={t("paymentMediums.empty")} />
                      </td>
                    </tr>
                  ) : (
                    intents.map((intent) => {
                      const resolvable = intent.status === "awaiting_payment" || intent.status === "ambiguous";
                      return (
                        <React.Fragment key={intent.id}>
                          <tr className="transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60">
                            <td className="px-3 py-3 font-mono font-medium text-gray-800 dark:text-gray-100">
                              {resolvable ? (
                                <button
                                  type="button"
                                  onClick={() => setViewingIntent(intent)}
                                  className="underline decoration-dotted underline-offset-2 hover:text-primary-600 dark:hover:text-primary-400"
                                  title={t("payment.scanToPay")}
                                >
                                  {intent.referenceCode}
                                </button>
                              ) : (
                                intent.referenceCode
                              )}
                            </td>
                            <td className="px-2 py-3 text-gray-800 dark:text-gray-100">
                              PKR {Number(intent.amount).toFixed(0)}
                            </td>
                            <td className="truncate px-2 py-3 text-gray-600 dark:text-gray-300">
                              {formatDateTime(intent.created_at, { dateStyle: "medium", timeStyle: "short" })}
                            </td>
                            <td className="px-2 py-3">
                              <span
                                className={`inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  STATUS_BADGE_CLASS[intent.status] || STATUS_BADGE_CLASS.awaiting_payment
                                }`}
                              >
                                {statusLabel(intent.status)}
                              </span>
                            </td>
                            <td className="px-2 py-3">
                              {resolvable && (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleConfirm(intent.id)}
                                    disabled={actioningId === intent.id}
                                    className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {t("paymentMediums.markAsPaid")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCancel(intent.id)}
                                    disabled={actioningId === intent.id}
                                    className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                                  >
                                    {t("paymentMediums.cancelPayment")}
                                  </button>
                                  {intent.status === "ambiguous" && (
                                    <button
                                      type="button"
                                      onClick={() => handleRequeue(intent.id)}
                                      disabled={actioningId === intent.id}
                                      className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                                    >
                                      {t("paymentMediums.keepWaiting")}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                          {intent.status === "ambiguous" && intent.match_candidates?.alsoMatchedIntentIds?.length > 0 && (
                            <tr>
                              <td colSpan={5} className="px-3 pb-3">
                                <div className="flex items-start gap-2 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-600 dark:bg-danger-500/10 dark:text-danger-400">
                                  <HiOutlineExclamationTriangle className="mt-0.5 shrink-0" />
                                  <span>
                                    {t("paymentMediums.ambiguousExplanation")}:{" "}
                                    {intent.match_candidates.alsoMatchedIntentIds
                                      .map((otherId) => `BTX-${String(otherId).padStart(6, "0")}`)
                                      .join(", ")}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}
                          {intent.last_confirm_error && (
                            <tr>
                              <td colSpan={5} className="px-3 pb-3">
                                <div className="flex items-start gap-2 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-600 dark:bg-danger-500/10 dark:text-danger-400">
                                  <HiOutlineExclamationTriangle className="mt-0.5 shrink-0" />
                                  <span>
                                    {t("paymentMediums.lastError")}: {intent.last_confirm_error}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              )}
            </table>
          </div>
        </div>
      </div>

      <BankTransferQrModal
        isOpen={viewingIntent !== null}
        intent={viewingIntent}
        onClose={() => {
          setViewingIntent(null);
          // The modal polls the intent's own status while open — re-fetch the list on
          // close so a payment that got confirmed while re-viewing the QR is reflected
          // immediately here too, instead of waiting for some other trigger to refresh.
          fetchIntents();
        }}
      />
    </AppShell>
  );
}
