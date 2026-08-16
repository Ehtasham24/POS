import { useEffect, useState } from "react";
import { Pagination } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useTimezone } from "timezone/TimezoneContext";
import { apiGet } from "utils/api";

const PAGE_SIZE = 20;

// Mirrors creditDebitComponents/PartyHistoryRow.jsx's shape (same lazy-fetch-on-expand
// pattern) but simpler — no edit/delete here, since store credit transactions aren't
// meant to be hand-corrected the way a mistyped credit/debit entry is (see the schema's
// reserved 'adjustment' kind for that, not built in this pass).
const kindLabel = (t, kind) => {
  if (kind === "issue") return t("storeCredit.kindIssue");
  if (kind === "redeem") return t("storeCredit.kindRedeem");
  return t("storeCredit.kindAdjustment");
};

const kindColor = (kind) =>
  kind === "redeem" ? "text-danger-600 dark:text-danger-400" : "text-success-600 dark:text-success-500";

export default function StoreCreditHistoryRow({ contactId, colSpan, refreshKey }) {
  const { t } = useLanguage();
  const { formatDateTime } = useTimezone();
  const [transactions, setTransactions] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchPage = async (pageToFetch) => {
    try {
      const data = await apiGet(
        `/api/store-credit/${contactId}/transactions?page=${pageToFetch}&pageSize=${PAGE_SIZE}`
      );
      setTransactions(data.transactions);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error("Error fetching store credit history:", error);
      setLoadError(true);
      setTransactions([]);
    }
  };

  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, refreshKey]);

  return (
    <tr>
      <td colSpan={colSpan} className="bg-surface-subtle px-5 py-4 dark:bg-gray-900">
        {transactions === null ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("storeCredit.loadingHistory")}</p>
        ) : loadError ? (
          <p className="text-sm text-danger-600 dark:text-danger-400">
            Couldn't load history — check your connection and try again.
          </p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("storeCredit.noHistory")}</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-surface-border dark:border-gray-700">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="bg-surface-muted dark:bg-gray-800">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("storeCredit.date")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("storeCredit.type")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("storeCredit.note")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("storeCredit.amount")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("storeCredit.runningBalance")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
                        {formatDateTime(tx.occurred_on, { dateStyle: "medium" })}
                      </td>
                      <td className={`px-3 py-2 font-medium ${kindColor(tx.kind)}`}>{kindLabel(t, tx.kind)}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        {tx.note || (tx.refund_id ? `Refund #${tx.refund_id}` : tx.transaction_id ? `Sale #${tx.transaction_id}` : "—")}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 font-medium ${kindColor(tx.kind)}`}>
                        {tx.kind === "redeem" ? "-" : "+"}Rs.{Number(tx.amount).toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800 dark:text-gray-100">
                        Rs.{Number(tx.running_balance).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalCount > PAGE_SIZE && (
              <div className="mt-3 flex justify-end">
                <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} loading={false} />
              </div>
            )}
          </>
        )}
      </td>
    </tr>
  );
}
