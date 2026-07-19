import React, { useState, useEffect, useRef } from "react";
import DateRangeSelector from "./DataRangeSelector";
import PrintButton from "./PrintBtn";
import Header from "components/Header";
import Footer from "components/Footer";
import GroupedSalesData from "./GroupedSalesData";

const SalesDataComponent = () => {
  const [salesData, setSalesData] = useState([]);
  const [totalProfitLoss, setTotalProfitLoss] = useState(0);
  const [filterType, setFilterType] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState("2024-01-01T00:00");
  const [endDate, setEndDate] = useState("2024-12-30T23:59");

  const printRef = useRef();

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
  };

  useEffect(() => {
    fetchSalesData(filterType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="flex flex-col min-h-screen bg-white-A700 dark:bg-gray-900">
      <Header className="flex flex-row justify-between items-center w-full p-6 sm:p-5 bg-white-A700" />

      <div className="flex-1 max-w-7xl w-full mx-auto p-6 bg-surface-subtle dark:bg-gray-800 rounded-xl2 shadow-card my-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-4">
          Sales Data Overview
        </h1>

        <DateRangeSelector
          startDate={startDate}
          endDate={endDate}
          filterType={filterType}
          onStartDateChange={(e) => setStartDate(e.target.value)}
          onEndDateChange={(e) => setEndDate(e.target.value)}
          onFilterChange={(e) => setFilterType(e.target.value)}
          fetchSalesData={fetchSalesData}
        />

        <PrintButton handlePrint={handlePrint} />

        {loading ? (
          <p className="text-primary-600">Loading data...</p>
        ) : error ? (
          <p className="text-danger-600">{error}</p>
        ) : (
          <>
            <p className="font-semibold text-lg text-gray-800 dark:text-gray-100 mb-4">
              Total Profit/Loss:{" "}
              <span
                className={
                  totalProfitLoss >= 0 ? "text-success-600" : "text-danger-600"
                }
              >
                {totalProfitLoss}
              </span>
            </p>

            <div ref={printRef}>
              <GroupedSalesData groupedData={groupedData} />
            </div>
          </>
        )}
      </div>

      <Footer className="flex justify-center items-center w-full mt-auto p-[30px] sm:p-5 bg-gray-800" />
    </div>
  );
};

export default SalesDataComponent;
