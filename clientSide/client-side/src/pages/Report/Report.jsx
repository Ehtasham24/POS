import React, { useState, useEffect, useRef } from "react";
import DateRangeSelector from "./DataRangeSelector";
import PrintButton from "./PrintBtn";
import GroupedSalesData from "./GroupedSalesData";
import SalesCharts from "./SalesCharts";
import ReportPrintHeader from "./ReportPrintHeader";
import ShrinkageSummary from "./ShrinkageSummary";
import AppShell from "components/AppShell";
import { PaymentMediumSummary } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { useFeature } from "auth/useFeature";
import { apiPost } from "utils/api";
import useUrlFilterState from "hooks/useUrlFilterState";

// Local (not UTC) "YYYY-MM-DDTHH:mm" — the format <input type="datetime-local"> expects.
const formatLocal = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return formatLocal(d);
};

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return formatLocal(d);
};

const SalesDataComponent = () => {
  const toast = useToast();
  const { t } = useLanguage();
  // Charts (trend graph) are Smart+, shrinkage cost analysis is Advanced-only — this page
  // predates the tier system and used to call/render both unconditionally, which 403'd on
  // a downgraded shop (the trend fetch surfaced as a visible toast; ShrinkageSummary failed
  // silently but stayed stuck on its loading skeleton forever). Total Profit/Loss and the
  // payment-medium breakdown stay on every tier — only these two are gated.
  const hasSalesCharts = useFeature("salesCharts");
  const hasShrinkageReport = useFeature("shrinkageReport");
  const [salesData, setSalesData] = useState([]);
  const [timeSeriesData, setTimeSeriesData] = useState([]);
  const [totalProfitLoss, setTotalProfitLoss] = useState(0);
  // URL-backed (hooks/useUrlFilterState), not plain useState — a bare useState here reset
  // to defaults on every remount, which is exactly what happens navigating away (e.g.
  // ShrinkageSummary's "View Detail" -> Stock Adjustments) and back; this survives that.
  const [filterType, setFilterType] = useUrlFilterState("filterType", "all");
  const [paymentMethod, setPaymentMethod] = useUrlFilterState("paymentMethod", "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Called directly, not passed as a bare reference — unlike useState, this hook has no
  // special lazy-initializer case for a function value, so `startOfToday` (the function
  // itself) would otherwise become the stored value verbatim, only ever actually invoked
  // when something coerces it to a string (a template literal, a query param) later on,
  // producing that function's own SOURCE CODE text instead of a date. Confirmed live —
  // this was the exact bug caught during this fix's own browser verification.
  const [startDate, setStartDate] = useUrlFilterState("startDate", startOfToday());
  const [endDate, setEndDate] = useUrlFilterState("endDate", endOfToday());
  const chartsRef = useRef(null);
  // Guards against the classic out-of-order-response race: adjusting a datetime-local
  // input fires onChange per field segment, so several fetches can be in flight at once —
  // without this, whichever RESPONSE happens to resolve last wins, not whichever request
  // was actually issued last, so an older/slower response for a since-abandoned date range
  // could silently overwrite the charts with stale data even though the filter on screen
  // has already moved on. ShrinkageSummary/PaymentMediumSummary on this same page already
  // guard their own single fetch this same way with a `cancelled` boolean; this is the
  // equivalent for fetchSalesData/fetchTimeSeries, which chain two fetches per filter change.
  const requestIdRef = useRef(0);

  const fetchTimeSeries = async (requestId) => {
    try {
      const data = await apiPost("/api/Sales/timeseries", {
        startDate,
        endDate,
        paymentMethod: paymentMethod || undefined,
      });
      if (requestId !== requestIdRef.current) return; // a newer filter change has since started
      setTimeSeriesData(data);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("Error fetching sales trend:", err);
      toast.error("Couldn't load the sales trend chart — check your connection and try again.");
    }
  };

  const fetchSalesData = async (type) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    let url = "/api/Sales";
    let payload = { startDate, endDate, paymentMethod: paymentMethod || undefined };

    if (type !== "all") {
      url = "/api/Sales/filter";
      payload = { ...payload, type };
    }

    try {
      const data = await apiPost(url, payload);
      if (requestId !== requestIdRef.current) return; // superseded by a newer filter change
      setSalesData(data.salesData);
      setTotalProfitLoss(data.totalProfitLoss);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err.message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
    if (hasSalesCharts && requestId === requestIdRef.current) fetchTimeSeries(requestId);
  };

  useEffect(() => {
    fetchSalesData(filterType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, startDate, endDate, paymentMethod]);

  // A printed page is always on white paper — force light mode for the print output even
  // if the app is currently in dark mode, otherwise dark: text/background colors would
  // print as white-on-white (or worse) instead of respecting .print-area's fixed
  // black/gray palette. afterprint (not code immediately following window.print()) is
  // what reliably fires once the print dialog is dismissed, in every major browser.
  //
  // The charts keep their entrance animation (SalesCharts.jsx), so before printing we:
  // 1. Add "is-printing" — the same layout switch @media print applies (see tailwind.css)
  //    — right now, while script can still wait on it, instead of only implicitly inside
  //    the blocking window.print() call.
  // 2. Await waitForAnimations(), which forces the charts to remount at that print layout
  //    and resolves once they've actually finished animating.
  // 3. Only then call window.print() — the page is already sized/settled for print, so
  //    nothing changes again mid-print to restart an animation and get caught unfinished.
  const handlePrint = async () => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    if (wasDark) root.classList.remove("dark");
    const restoreTheme = () => {
      root.classList.remove("is-printing");
      if (wasDark) root.classList.add("dark");
      window.removeEventListener("afterprint", restoreTheme);
    };
    window.addEventListener("afterprint", restoreTheme);

    root.classList.add("is-printing");
    if (chartsRef.current) {
      await chartsRef.current.waitForAnimations();
    }

    window.print();
  };

  const groupByCategory = (data) => {
    return data.reduce((acc, item) => {
      if (!acc[item.category_id]) acc[item.category_id] = [];
      acc[item.category_id].push(item);
      return acc;
    }, {});
  };

  const groupedData = groupByCategory(salesData);

  return (
    <AppShell title={t("report.title")}>
      <div className="mx-auto w-full max-w-6xl">
        <DateRangeSelector
          startDate={startDate}
          endDate={endDate}
          filterType={filterType}
          paymentMethod={paymentMethod}
          onStartDateChange={(e) => setStartDate(e.target.value)}
          onEndDateChange={(e) => setEndDate(e.target.value)}
          onFilterChange={(e) => setFilterType(e.target.value)}
          onPaymentMethodChange={(e) => setPaymentMethod(e.target.value)}
        />

        <PrintButton handlePrint={handlePrint} />

        {loading ? (
          <p className="text-primary-600">{t("report.loading")}</p>
        ) : error ? (
          <p className="text-danger-600">{error}</p>
        ) : (
          // Everything the Print button should produce lives in here — see .print-area
          // in styles/tailwind.css, which hides everything else (sidebar, filters, the
          // button itself) automatically rather than needing each one marked individually.
          <div className="print-area">
            <ReportPrintHeader startDate={startDate} endDate={endDate} filterType={filterType} />

            <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-surface-border bg-white-A700 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <span className="text-sm text-gray-500 dark:text-gray-400">{t("report.totalProfitLoss")}</span>
              <span
                className={`font-poppins text-lg font-bold ${
                  totalProfitLoss >= 0 ? "text-success-600" : "text-danger-600"
                }`}
              >
                {totalProfitLoss}
              </span>
            </div>

            <p className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
              {t("report.paymentMediumBreakdown")}
            </p>
            <PaymentMediumSummary startDate={startDate} endDate={endDate} />

            {hasShrinkageReport && <ShrinkageSummary startDate={startDate} endDate={endDate} />}

            {hasSalesCharts && (
              <SalesCharts ref={chartsRef} salesData={salesData} timeSeriesData={timeSeriesData} />
            )}

            <GroupedSalesData groupedData={groupedData} />
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default SalesDataComponent;
