import { useEffect, useState } from "react";
import { Pagination } from "components";
import { useLanguage } from "i18n/LanguageContext";
import { useTimezone } from "timezone/TimezoneContext";
import { apiGet } from "utils/api";

const PAGE_SIZE = 20;

// Redemption history for one voucher — mirrors creditDebitComponents/PartyHistoryRow.jsx's
// lazy-fetch-on-expand pattern. Every row here is a redemption (the voucher's own "issue"
// is the refund itself, shown once in the parent row, not repeated here).
export default function StoreCreditHistoryRow({ refundId, colSpan }) {
  const { t } = useLanguage();
  const { formatDateTime } = useTimezone();
  const [redemptions, setRedemptions] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchPage = async (pageToFetch) => {
    try {
      const data = await apiGet(
        `/api/store-credit/vouchers/${refundId}/history?page=${pageToFetch}&pageSize=${PAGE_SIZE}`
      );
      setRedemptions(data.redemptions);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error("Error fetching voucher history:", error);
      setLoadError(true);
      setRedemptions([]);
    }
  };

  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refundId]);

  return (
    <tr>
      <td colSpan={colSpan} className="bg-surface-subtle px-5 py-4 dark:bg-gray-900">
        {redemptions === null ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("storeCredit.loadingHistory")}</p>
        ) : loadError ? (
          <p className="text-sm text-danger-600 dark:text-danger-400">
            Couldn't load history — check your connection and try again.
          </p>
        ) : redemptions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("storeCredit.noRedemptions")}</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-surface-border dark:border-gray-700">
              <table className="w-full min-w-[420px] border-collapse">
                <thead>
                  <tr className="bg-surface-muted dark:bg-gray-800">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("storeCredit.date")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("storeCredit.amount")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      {t("storeCredit.appliedTo")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                  {redemptions.map((red) => (
                    <tr key={red.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">
                        {formatDateTime(red.redeemed_at, { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-danger-600 dark:text-danger-400">
                        -Rs.{Number(red.amount).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        {red.transaction_id ? `Sale #${red.transaction_id}` : "—"}
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
