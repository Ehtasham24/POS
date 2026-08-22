import React, { useState, useEffect, useRef } from "react";
import DateRangeSelector from "./DataRangeSelector";
import PrintButton from "./PrintBtn";
import GroupedSalesData from "./GroupedSalesData";
import SalesCharts from "./SalesCharts";
import ReportPrintHeader from "./ReportPrintHeader";
import AppShell from "components/AppShell";
import { PaymentMediumSummary } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiPost } from "utils/api";

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
  const [salesData, setSalesData] = useState([]);
  const [timeSeriesData, setTimeSeriesData] = useState([]);
  const [totalProfitLoss, setTotalProfitLoss] = useState(0);
  const [filterType, setFilterType] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(startOfToday);
  const [endDate, setEndDate] = useState(endOfToday);
  const chartsRef = useRef(null);

  const fetchTimeSeries = async () => {
    try {
      const data = await apiPost("/api/Sales/timeseries", {
        startDate,
        endDate,
        paymentMethod: paymentMethod || undefined,
      });
      setTimeSeriesData(data);
    } catch (err) {
      console.error("Error fetching sales trend:", err);
      toast.error("Couldn't load the sales trend chart — check your connection and try again.");
    }
  };

  const fetchSalesData = async (type) => {
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
      setSalesData(data.salesData);
      setTotalProfitLoss(data.totalProfitLoss);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    fetchTimeSeries();
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

            <SalesCharts ref={chartsRef} salesData={salesData} timeSeriesData={timeSeriesData} />

            <GroupedSalesData groupedData={groupedData} />
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default SalesDataComponent;
