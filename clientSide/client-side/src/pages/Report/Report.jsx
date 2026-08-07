import React, { useState, useEffect, useRef } from "react";
import DateRangeSelector from "./DataRangeSelector";
import PrintButton from "./PrintBtn";
import GroupedSalesData from "./GroupedSalesData";
import SalesCharts from "./SalesCharts";
import AppShell from "components/AppShell";

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
  const [salesData, setSalesData] = useState([]);
  const [timeSeriesData, setTimeSeriesData] = useState([]);
  const [totalProfitLoss, setTotalProfitLoss] = useState(0);
  const [filterType, setFilterType] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(startOfToday);
  const [endDate, setEndDate] = useState(endOfToday);

  const printRef = useRef();

  const fetchTimeSeries = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/Sales/timeseries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!response.ok) throw new Error("Failed to fetch sales trend");
      const data = await response.json();
      setTimeSeriesData(data);
    } catch (err) {
      console.error("Error fetching sales trend:", err);
    }
  };

  const fetchSalesData = async (type) => {
    setLoading(true);
    setError(null);
    let url = "http://localhost:4000/api/Sales";
    let payload = { startDate, endDate };

    if (type !== "all") {
      url = "http://localhost:4000/api/Sales/filter";
      payload = { ...payload, type };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch sales data");
      }
      const data = await response.json();
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
  }, [filterType, startDate, endDate]);

  const handlePrint = () => window.print();

  const groupByCategory = (data) => {
    return data.reduce((acc, item) => {
      if (!acc[item.category_id]) acc[item.category_id] = [];
      acc[item.category_id].push(item);
      return acc;
    }, {});
  };

  const groupedData = groupByCategory(salesData);

  return (
    <AppShell title="Sales Report">
      <div className="mx-auto w-full max-w-6xl">
        <DateRangeSelector
          startDate={startDate}
          endDate={endDate}
          filterType={filterType}
          onStartDateChange={(e) => setStartDate(e.target.value)}
          onEndDateChange={(e) => setEndDate(e.target.value)}
          onFilterChange={(e) => setFilterType(e.target.value)}
        />

        <PrintButton handlePrint={handlePrint} />

        {loading ? (
          <p className="text-primary-600">Loading data...</p>
        ) : error ? (
          <p className="text-danger-600">{error}</p>
        ) : (
          <>
            <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-surface-border bg-white-A700 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <span className="text-sm text-gray-500 dark:text-gray-400">Total Profit/Loss:</span>
              <span
                className={`font-poppins text-lg font-bold ${
                  totalProfitLoss >= 0 ? "text-success-600" : "text-danger-600"
                }`}
              >
                {totalProfitLoss}
              </span>
            </div>

            <SalesCharts salesData={salesData} timeSeriesData={timeSeriesData} />

            <div ref={printRef}>
              <GroupedSalesData groupedData={groupedData} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
};

export default SalesDataComponent;
