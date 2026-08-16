import React, { useEffect, useState } from "react";
import { HiOutlineReceiptRefund, HiOutlineChevronDown, HiOutlineChevronRight } from "react-icons/hi2";
import AppShell from "components/AppShell";
import { SkeletonRows, EmptyState } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { useTimezone } from "timezone/TimezoneContext";
import { apiGet } from "utils/api";
import StoreCreditHistoryRow from "storeCreditComponents/StoreCreditHistoryRow";

const formatVoucherCode = (refundId) => `REF-${String(refundId).padStart(6, "0")}`;

// Gift-voucher model, not a customer list (see migrations/011_store_credit_vouchers.sql) —
// every row here is one store-credit refund still holding a balance, identified by its own
// code. Read-only for this pass: issuing happens via SalesHistory's refund modal, redeeming
// happens at checkout (CartPanel.jsx), both of which already write here.
export default function StoreCreditPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const { formatDateTime } = useTimezone();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRefundId, setExpandedRefundId] = useState(null);

  useEffect(() => {
    apiGet("/api/store-credit/vouchers")
      .then(setVouchers)
      .catch((error) => {
        console.error("Error fetching store credit vouchers:", error);
        toast.error("Couldn't load store credit — check your connection and try again.");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalOutstanding = vouchers.reduce((sum, v) => sum + Number(v.balance), 0);

  return (
    <AppShell title={t("storeCredit.title")}>
      <div className="max-w-4xl">
        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-gray-700">
            <HiOutlineReceiptRefund className="text-xl text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("storeCredit.totalOutstanding")}</p>
            <p className="font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">
              Rs.{totalOutstanding.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed border-collapse">
              <thead className="bg-surface-subtle dark:bg-gray-800">
                <tr>
                  <th className="w-8"></th>
                  <th className="w-36 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("storeCredit.code")}
                  </th>
                  <th className="text-left pr-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("storeCredit.taggedCustomer")}
                  </th>
                  <th className="w-28 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("storeCredit.issued")}
                  </th>
                  <th className="w-32 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("storeCredit.balance")}
                  </th>
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
                  {vouchers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-2">
                        <EmptyState icon={HiOutlineReceiptRefund} title={t("storeCredit.empty")} />
                      </td>
                    </tr>
                  ) : (
                    vouchers.map((v) => {
                      const isExpanded = expandedRefundId === v.refund_id;
                      return (
                        <React.Fragment key={v.refund_id}>
                          <tr className="transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60">
                            <td className="pl-3">
                              <button
                                type="button"
                                onClick={() => setExpandedRefundId(isExpanded ? null : v.refund_id)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
                              >
                                {isExpanded ? <HiOutlineChevronDown /> : <HiOutlineChevronRight />}
                              </button>
                            </td>
                            <td className="px-2 py-3 font-mono font-medium text-gray-800 dark:text-gray-100">
                              {formatVoucherCode(v.refund_id)}
                            </td>
                            <td className="pr-2 py-3 truncate text-gray-600 dark:text-gray-300">
                              {v.contact_name || t("storeCredit.notTagged")}
                            </td>
                            <td className="truncate px-2 py-3 text-gray-600 dark:text-gray-300">
                              {formatDateTime(v.refunded_at, { dateStyle: "medium" })}
                            </td>
                            <td className="px-2 py-3">
                              <span className="inline-flex max-w-full truncate rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                                Rs.{Number(v.balance).toFixed(2)}
                              </span>
                            </td>
                          </tr>
                          {isExpanded && <StoreCreditHistoryRow refundId={v.refund_id} colSpan={5} />}
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
    </AppShell>
  );
}
