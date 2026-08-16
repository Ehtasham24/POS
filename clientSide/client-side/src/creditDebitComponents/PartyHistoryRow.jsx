import { useEffect, useState } from "react";
import { HiOutlinePencil, HiOutlineTrash } from "react-icons/hi2";
import { Pagination } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useTimezone } from "timezone/TimezoneContext";
import { apiGet } from "utils/api";

const PAGE_SIZE = 20;

const kindLabel = (t, kind, direction) => {
  if (kind === "adjustment") return t("creditDebit.adjustment");
  if (direction === "receivable") {
    return kind === "charge" ? t("creditDebit.chargeReceivable") : t("creditDebit.paymentReceivable");
  }
  return kind === "charge" ? t("creditDebit.chargePayable") : t("creditDebit.paymentPayable");
};

const kindColor = (kind) =>
  kind === "payment" ? "text-success-600 dark:text-success-500" : "text-gray-800 dark:text-gray-100";

// The arrow's content — follows the same pattern as pages/Inventory/index.jsx's LotsRow:
// it *is* the extra <tr>, mounted only while its party row is expanded, lazy-fetching in
// its own effect. Edit/delete buttons here only report *which* transaction was picked —
// the actual Modal lives once at the CreditDebit page level (Modal isn't a portal, so
// rendering one from inside a <tr> would put invalid markup inside the table).
export default function PartyHistoryRow({
  contactId,
  direction,
  colSpan,
  refreshKey,
  onEditTransaction,
  onDeleteTransaction,
}) {
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
        `/api/parties/${contactId}/transactions?direction=${direction}&page=${pageToFetch}&pageSize=${PAGE_SIZE}`
      );
      setTransactions(data.transactions);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error("Error fetching party history:", error);
      setLoadError(true);
      setTransactions([]);
    }
  };

  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, direction, refreshKey]);

  return (
    <tr>
      <td colSpan={colSpan} className="bg-surface-subtle px-5 py-4 dark:bg-gray-900">
        {transactions === null ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("creditDebit.loadingHistory")}</p>
        ) : loadError ? (
          <p className="text-sm text-danger-600 dark:text-danger-400">
            Couldn't load history — check your connection and try again.
          </p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("creditDebit.noHistory")}</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-surface-border dark:border-gray-700">
              <table className="w-full min-w-[620px] border-collapse">
                <thead>
                  <tr className="bg-surface-muted dark:bg-gray-800">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("creditDebit.date")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("creditDebit.type")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("creditDebit.note")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("creditDebit.amount")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("creditDebit.runningBalance")}
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
                        {formatDateTime(tx.occurred_on, { dateStyle: "medium" })}
                      </td>
                      <td className={`px-3 py-2 font-medium ${kindColor(tx.kind)}`}>
                        {kindLabel(t, tx.kind, direction)}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{tx.note || "—"}</td>
                      <td className={`whitespace-nowrap px-3 py-2 font-medium ${kindColor(tx.kind)}`}>
                        {tx.kind === "payment" ? "-" : "+"}Rs.{Number(tx.amount).toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800 dark:text-gray-100">
                        Rs.{Number(tx.running_balance).toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onEditTransaction({ ...tx, direction })}
                          aria-label="Edit entry"
                          className="mr-1 rounded-lg p-1.5 text-gray-500 hover:bg-surface-border dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                          <HiOutlinePencil className="text-sm" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTransaction({ ...tx, direction })}
                          aria-label="Delete entry"
                          className="rounded-lg p-1.5 text-danger-600 hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-500/10"
                        >
                          <HiOutlineTrash className="text-sm" />
                        </button>
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
