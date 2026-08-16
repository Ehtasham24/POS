import React, { useEffect, useState } from "react";
import { HiOutlineReceiptRefund, HiOutlineChevronDown, HiOutlineChevronRight } from "react-icons/hi2";
import AppShell from "components/AppShell";
import { SkeletonRows, EmptyState } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet } from "utils/api";
import StoreCreditHistoryRow from "storeCreditComponents/StoreCreditHistoryRow";

// Read-only for this pass (see the plan's non-goals) — credit is only ever issued via a
// refund (SalesHistory's refund modal) or redeemed at checkout (CartPanel.jsx), both of
// which already write here; this page is purely "who currently has how much, and why."
export default function StoreCreditPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedContactId, setExpandedContactId] = useState(null);

  useEffect(() => {
    apiGet("/api/store-credit")
      .then(setCustomers)
      .catch((error) => {
        console.error("Error fetching store credit list:", error);
        toast.error("Couldn't load store credit — check your connection and try again.");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalOutstanding = customers.reduce((sum, c) => sum + Number(c.balance), 0);

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
            <table className="w-full min-w-[520px] table-fixed border-collapse">
              <thead className="bg-surface-subtle dark:bg-gray-800">
                <tr>
                  <th className="w-8"></th>
                  <th className="text-left pr-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("storeCredit.customer")}
                  </th>
                  <th className="w-28 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("storeCredit.issued")}
                  </th>
                  <th className="w-28 text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {t("storeCredit.redeemed")}
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
                  {customers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-2">
                        <EmptyState icon={HiOutlineReceiptRefund} title={t("storeCredit.empty")} />
                      </td>
                    </tr>
                  ) : (
                    customers.map((row) => {
                      const isExpanded = expandedContactId === row.contact_id;
                      return (
                        <React.Fragment key={row.contact_id}>
                          <tr className="transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60">
                            <td className="pl-3">
                              <button
                                type="button"
                                onClick={() => setExpandedContactId(isExpanded ? null : row.contact_id)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
                              >
                                {isExpanded ? <HiOutlineChevronDown /> : <HiOutlineChevronRight />}
                              </button>
                            </td>
                            <td className="pr-2 py-3 truncate font-medium text-gray-800 dark:text-gray-100" title={row.name}>
                              {row.name}
                            </td>
                            <td className="truncate px-2 py-3 text-gray-800 dark:text-gray-100">
                              Rs.{Number(row.total_issued).toFixed(2)}
                            </td>
                            <td className="truncate px-2 py-3 text-gray-800 dark:text-gray-100">
                              Rs.{Number(row.total_redeemed).toFixed(2)}
                            </td>
                            <td className="px-2 py-3">
                              <span className="inline-flex max-w-full truncate rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                                Rs.{Number(row.balance).toFixed(2)}
                              </span>
                            </td>
                          </tr>
                          {isExpanded && (
                            <StoreCreditHistoryRow contactId={row.contact_id} colSpan={5} refreshKey={0} />
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
    </AppShell>
  );
}
