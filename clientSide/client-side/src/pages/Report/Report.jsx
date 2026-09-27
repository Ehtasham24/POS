import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DateRangeSelector from "./DataRangeSelector";
import PrintButton from "./PrintBtn";
import ReportPrintHeader from "./ReportPrintHeader";
import ShrinkageSummary from "./ShrinkageSummary";
import ReportKpis from "./ReportKpis";
import ReportBreakdowns from "./ReportBreakdowns";
import ProductPerformance from "./ProductPerformance";
import AppShell from "components/AppShell";
import { PaymentMediumSummary } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { useFeature } from "auth/useFeature";
import useUrlFilterState from "hooks/useUrlFilterState";
import useDebounce from "hooks/useDebounce";
import { reportPost } from "./reportApi";

// Recharts is the heaviest thing on this page — loaded as its own chunk, so the numbers
// (tiles, tables) show up first on a slow connection and the charts follow.
const SalesCharts = lazy(() => import("./SalesCharts"));

// Local (not UTC) "YYYY-MM-DDTHH:mm" — the format <input type="datetime-local"> expects.
const formatLocal = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

// A datetime-local input fires onChange per edited segment (day, month, hour...) — wait for
// the edits to settle before asking the server, instead of one request per keystroke.
const FILTER_DEBOUNCE_MS = 400;

const SalesDataComponent = () => {
  const toast = useToast();
  const { t, language } = useLanguage();
  // Charts (trend/when) are Smart+, shrinkage cost analysis is Advanced-only. The tiles,
  // breakdown tables, payment mediums and product table are on every tier.
  const hasSalesCharts = useFeature("salesCharts");
  const hasShrinkageReport = useFeature("shrinkageReport");

  // URL-backed (hooks/useUrlFilterState), so the filters survive navigating away and back
  // (e.g. Shrinkage's "View Detail" -> Stock Adjustments -> Back).
  const [filterType, setFilterType] = useUrlFilterState("filterType", "all");
  const [paymentMethod, setPaymentMethod] = useUrlFilterState("paymentMethod", "");
  const [startDate, setStartDate] = useUrlFilterState("startDate", startOfToday());
  const [endDate, setEndDate] = useUrlFilterState("endDate", endOfToday());
  const [breakdownView, setBreakdownView] = useUrlFilterState("breakdown", "category");
  const [searchParams, setSearchParams] = useSearchParams();

  const queryStart = useDebounce(startDate, FILTER_DEBOUNCE_MS);
  const queryEnd = useDebounce(endDate, FILTER_DEBOUNCE_MS);

  const [summary, setSummary] = useState(null);
  const [breakdowns, setBreakdowns] = useState(null);
  const [timeSeriesData, setTimeSeriesData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const chartsRef = useRef(null);
  const productsRef = useRef(null);
  // Only the latest filter change may set state — an older, slower response for a filter
  // that's since moved on must never overwrite what's on screen.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const body = {
      startDate: queryStart,
      endDate: queryEnd,
      paymentMethod: paymentMethod || undefined,
    };
    const isCurrent = () => requestId === requestIdRef.current;
    setSummary(null);

    // Independent of each other, so they all go at once rather than one after another.
    reportPost("/api/Sales/summary", body)
      .then((data) => isCurrent() && setSummary(data))
      .catch((error) => isCurrent() && toast.error(error.message));
    reportPost("/api/Sales/breakdowns", body)
      .then((data) => isCurrent() && setBreakdowns(data))
      .catch((error) => isCurrent() && toast.error(error.message));
    if (hasSalesCharts) {
      reportPost("/api/Sales/timeseries", body)
        .then((data) => isCurrent() && setTimeSeriesData(data))
        .catch((error) => isCurrent() && toast.error(error.message));
      reportPost("/api/Sales/products", {
        ...body,
        sort: "profit",
        direction: "desc",
        page: 1,
        pageSize: 8,
      })
        .then((data) => isCurrent() && setTopProducts(data.rows.map((r) => ({ name: r.productname, profit: r.profit }))))
        .catch(() => isCurrent() && setTopProducts([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryStart, queryEnd, paymentMethod, hasSalesCharts]);

  // Both ends in ONE URL update: two separate setters in the same tick would each start from
  // the same snapshot and the second would undo the first (this app's react-router-dom has
  // no functional-updater form for setSearchParams).
  const setRange = (start, end) => {
    const next = new URLSearchParams(searchParams);
    next.set("startDate", start);
    next.set("endDate", end);
    setSearchParams(next, { replace: true });
  };

  const weekdayLabel = (isoDay) =>
    // 2024-01-01 was a Monday, ISO day 1.
    new Date(Date.UTC(2024, 0, isoDay)).toLocaleDateString(language === "ur" ? "ur-PK" : "en-US", {
      weekday: "short",
      timeZone: "UTC",
    });

  // A printed page is always on white paper — force light mode for the print output even
  // if the app is currently in dark mode, otherwise dark: text/background colors would
  // print as white-on-white (or worse). afterprint (not code immediately following
  // window.print()) is what reliably fires once the print dialog is dismissed.
  //
  // Before printing: switch to the print layout ("is-printing", same as @media print), load
  // the FULL product list (the screen only holds one page of it), and wait for the charts
  // to finish re-animating at the print width — so nothing is half-drawn or missing on paper.
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
    try {
      await productsRef.current?.loadAllForPrint();
    } catch (error) {
      toast.error(error.message);
    }
    if (chartsRef.current) await chartsRef.current.waitForAnimations();

    window.print();
  };

  return (
    <AppShell title={t("report.title")}>
      <div className="mx-auto w-full max-w-6xl">
        <DateRangeSelector
          startDate={startDate}
          endDate={endDate}
          paymentMethod={paymentMethod}
          onStartDateChange={(e) => setStartDate(e.target.value)}
          onEndDateChange={(e) => setEndDate(e.target.value)}
          onRangeChange={setRange}
          onPaymentMethodChange={(e) => setPaymentMethod(e.target.value)}
        />

        <PrintButton handlePrint={handlePrint} />

        {/* Everything the Print button should produce lives in here — see .print-area in
            styles/tailwind.css, which hides everything else automatically. */}
        <div className="print-area">
          <ReportPrintHeader startDate={queryStart} endDate={queryEnd} filterType={filterType} />

          <ReportKpis summary={summary} />

          <p className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">{t("report.paymentMediumBreakdown")}</p>
          <PaymentMediumSummary startDate={queryStart} endDate={queryEnd} />

          {hasSalesCharts && (
            <Suspense fallback={<div className="mb-6 h-72 animate-pulse rounded-2xl bg-white-A700 dark:bg-gray-900" />}>
              <SalesCharts
                ref={chartsRef}
                timeSeriesData={timeSeriesData}
                topProducts={topProducts}
                byHour={breakdowns?.byHour}
                byWeekday={breakdowns?.byWeekday}
                weekdayLabel={weekdayLabel}
              />
            </Suspense>
          )}

          {/* Where the sales came from, beside what was lost to shrinkage (when the tier has it). */}
          <div className="mb-6 grid grid-cols-3 items-start gap-4 md:grid-cols-1">
            <ReportBreakdowns
              breakdowns={breakdowns}
              netSales={summary?.current.netSales ?? 0}
              view={breakdownView}
              onViewChange={setBreakdownView}
              className={hasShrinkageReport ? "col-span-2 md:col-span-1" : "col-span-3 md:col-span-1"}
            />
            {hasShrinkageReport && <ShrinkageSummary startDate={queryStart} endDate={queryEnd} />}
          </div>

          <ProductPerformance
            ref={productsRef}
            startDate={queryStart}
            endDate={queryEnd}
            paymentMethod={paymentMethod}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            categories={breakdowns?.byCategory.filter((c) => c.category_id) ?? []}
          />
        </div>
      </div>
    </AppShell>
  );
};

export default SalesDataComponent;
