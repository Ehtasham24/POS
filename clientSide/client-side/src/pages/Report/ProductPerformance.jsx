import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { HiOutlineMagnifyingGlass, HiOutlineChevronUp, HiOutlineChevronDown, HiOutlineChevronUpDown } from "react-icons/hi2";
import Pagination from "components/Pagination";
import { useLanguage } from "i18n/LanguageContext";
import { useToast } from "components/Toast/ToastContext";
import useDebounce from "hooks/useDebounce";
import { reportPost, reportPostOnce } from "./reportApi";
import { formatPKR } from "utils/money";
import ReportCard from "./ReportCard";

const PAGE_SIZE = 25;
// The backend's own cap for one request — the printed report lists up to this many products.
const PRINT_LIMIT = 500;

const marginOf = (profit, revenue) => (revenue ? Math.round((profit / revenue) * 1000) / 10 : null);

const inputClass =
  "h-10 rounded-xl border border-surface-border bg-white-A700 text-sm text-gray-800 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

// Per-product performance for the report's range: paginated, sorted and filtered in the
// database (POST /api/Sales/products), so the page never has to load a whole catalog to
// show 25 rows. The totals row covers every matching product, not just the visible page.
//
// Printing needs every row, not one page — Report.jsx calls loadAllForPrint() through the
// ref before window.print(), which fills a print-only copy of the table.
const ProductPerformance = forwardRef(function ProductPerformance(
  { startDate, endDate, paymentMethod, filterType, onFilterTypeChange, categories },
  ref,
) {
  const { t } = useLanguage();
  const toast = useToast();
  const [sort, setSort] = useState({ key: "revenue", direction: "desc" });
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [categoryId, setCategoryId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printRows, setPrintRows] = useState(null);
  const requestIdRef = useRef(0);

  const query = {
    startDate,
    endDate,
    paymentMethod: paymentMethod || undefined,
    type: filterType === "profit" || filterType === "loss" ? filterType : undefined,
    categoryId: categoryId || undefined,
    search: debouncedSearch.trim() || undefined,
    sort: sort.key,
    direction: sort.direction,
  };
  const queryKey = JSON.stringify(query);

  // The page belongs to the filters it was chosen under — any filter change is page 1
  // straight away, in the same render (resetting it in an effect afterwards would first
  // fetch the old page number under the new filters, a wasted request on a slow link).
  const [pageFor, setPageFor] = useState({ key: queryKey, page: 1 });
  const page = pageFor.key === queryKey ? pageFor.page : 1;
  const setPage = (next) => setPageFor({ key: queryKey, page: next });

  useEffect(() => {
    // Same stale-response guard as Report.jsx: only the latest request may set state.
    const requestId = ++requestIdRef.current;
    setLoading(true);
    reportPost("/api/Sales/products", { ...query, page, pageSize: PAGE_SIZE })
      .then((result) => requestId === requestIdRef.current && setData(result))
      .catch((error) => {
        if (requestId !== requestIdRef.current) return;
        console.error("Error loading product performance:", error);
        toast.error(error.message);
      })
      .finally(() => requestId === requestIdRef.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, page]);

  useImperativeHandle(ref, () => ({
    loadAllForPrint: async () => {
      const all = await reportPostOnce("/api/Sales/products", {
        ...query,
        page: 1,
        pageSize: PRINT_LIMIT,
      });
      setPrintRows(all);
    },
  }));

  const toggleSort = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "desc" ? "asc" : "desc" }
        : { key, direction: key === "name" ? "asc" : "desc" },
    );

  const SortHeader = ({ sortKey, children, align = "right" }) => {
    const active = sort.key === sortKey;
    const Icon = !active ? HiOutlineChevronUpDown : sort.direction === "asc" ? HiOutlineChevronUp : HiOutlineChevronDown;
    return (
      <th
        className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${align === "right" ? "text-right" : "text-left"}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide ${
            active
              ? "text-primary-600 dark:text-primary-400"
              : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
          }`}
        >
          {children}
          <Icon className="text-sm" />
        </button>
      </th>
    );
  };

  const renderTable = (result, { sortable }) => {
    const Header = sortable
      ? SortHeader
      : ({ children, align = "right" }) => (
          <th
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 ${align === "right" ? "text-right" : "text-left"}`}
          >
            {children}
          </th>
        );
    const totals = result.totals;
    const totalMargin = marginOf(totals.profit, totals.revenue);
    return (
      <table className="w-full min-w-[56rem] table-auto">
        <thead className="bg-surface-subtle dark:bg-gray-800">
          <tr>
            <Header sortKey="name" align="left">
              {t("report.product")}
            </Header>
            <Header sortKey="qty">{t("report.sold")}</Header>
            <Header sortKey="refunded">{t("report.returned")}</Header>
            <Header sortKey="price">{t("report.avgPrice")}</Header>
            <Header sortKey="revenue">{t("report.netSales")}</Header>
            <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t("report.cost")}
            </th>
            <Header sortKey="profit">{t("report.profit")}</Header>
            <Header sortKey="margin">{t("report.margin")}</Header>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border dark:divide-gray-800">
          {result.rows.map((row) => {
            const margin = marginOf(row.profit, row.revenue);
            return (
              <tr key={row.productId} className="hover:bg-surface-subtle dark:hover:bg-gray-800/60">
                <td className="min-w-[12rem] px-4 py-2.5 text-sm text-gray-800 dark:text-gray-100">
                  <span className="font-medium">{row.productname}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {row.categoryName || t("report.unassigned")}
                  </span>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-right text-sm text-gray-800 dark:text-gray-100">
                  {row.qtySold.toLocaleString("en-US")}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400">
                  {row.qtyRefunded || "—"}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-right text-sm text-gray-800 dark:text-gray-100">
                  {row.avgPrice !== null ? formatPKR(row.avgPrice) : "—"}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-right text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {formatPKR(row.revenue)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400">
                  {formatPKR(row.cost)}
                </td>
                <td
                  className={`px-4 py-2.5 whitespace-nowrap text-right text-sm font-semibold ${row.profit < 0 ? "text-danger-600" : "text-success-600"}`}
                >
                  {formatPKR(row.profit)}
                </td>
                <td
                  className={`px-4 py-2.5 whitespace-nowrap text-right text-sm ${margin !== null && margin < 0 ? "text-danger-600" : "text-gray-800 dark:text-gray-100"}`}
                >
                  {margin !== null ? `${margin}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        {result.rows.length > 0 && (
          <tfoot className="border-t-2 border-surface-border bg-surface-subtle font-semibold dark:border-gray-700 dark:bg-gray-800">
            <tr>
              <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-100">
                {t("report.total")} <span className="font-normal text-gray-500">({result.totalCount})</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-800 dark:text-gray-100">
                {totals.qtySold.toLocaleString("en-US")}
              </td>
              <td />
              <td />
              <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-800 dark:text-gray-100">
                {formatPKR(totals.revenue)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400">
                {formatPKR(totals.cost)}
              </td>
              <td
                className={`px-4 py-3 whitespace-nowrap text-right text-sm ${totals.profit < 0 ? "text-danger-600" : "text-success-600"}`}
              >
                {formatPKR(totals.profit)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-800 dark:text-gray-100">
                {totalMargin !== null ? `${totalMargin}%` : "—"}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    );
  };

  const from = data && data.totalCount ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.totalCount) : 0;

  return (
    <ReportCard
      title={t("report.productPerformance")}
      avoidBreak={false}
      actions={
        <>
          <div className="relative">
            <HiOutlineMagnifyingGlass className="pointer-events-none absolute inset-y-0 left-3 my-auto text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("report.searchProducts")}
              className={`${inputClass} w-52 pl-9 pr-3`}
            />
          </div>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${inputClass} pl-3 pr-8`}>
            <option value="">{t("report.allCategories")}</option>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.category_name}
              </option>
            ))}
          </select>
          <select value={filterType} onChange={(e) => onFilterTypeChange(e.target.value)} className={`${inputClass} pl-3 pr-8`}>
            <option value="all">{t("report.allProducts")}</option>
            <option value="profit">{t("report.profitableProducts")}</option>
            <option value="loss">{t("report.lossProducts")}</option>
          </select>
        </>
      }
    >
      <div className="screen-only">
        <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
          {!data ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-muted dark:bg-gray-800" />
              ))}
            </div>
          ) : data.rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t("report.noSalesInPeriod")}</p>
          ) : (
            renderTable(data, { sortable: true })
          )}
        </div>
        {data && data.totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border px-5 py-3 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("report.showing", { from, to, total: data.totalCount })}
            </p>
            <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} loading={loading} />
          </div>
        )}
      </div>

      {printRows && <div className="print-only">{renderTable(printRows, { sortable: false })}</div>}
    </ReportCard>
  );
});

export default ProductPerformance;
