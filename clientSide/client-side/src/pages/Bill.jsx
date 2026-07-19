import React, { useEffect, useState } from "react";
import Header from "components/Header";
import Footer from "components/Footer";
import { printReceipt } from "utils/printReceipt";

import { Helmet } from "react-helmet";
const Receipt = () => {
  const [salesData, setSalesData] = useState([]); // Initialize as an empty array for multiple sales
  const [totalAmount, setTotalAmount] = useState(0);

  const fetchRecentSales = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/getsales");
      if (!response.ok) throw new Error("Failed to fetch sales data");
      const data = await response.json();

      // Access the sales data array
      const salesArray = data.data.data.salesData; // Correctly access the salesData array

      // Check if there are sales data and set the latest sale
      if (salesArray.length > 0) {
        setSalesData(salesArray); // Set all sales data
        // Calculate total amount from salesArray
        const total = salesArray.reduce(
          (acc, sale) => acc + sale.selling_price * sale.quantity,
          0
        );
        setTotalAmount(total);
      } else {
        setSalesData([]); // Set to an empty array if no sales
        setTotalAmount(0);
      }
    } catch (error) {
      console.error("Error fetching sales data:", error);
    }
  };

  useEffect(() => {
    fetchRecentSales();
  }, []);

  return (
    <>
      <Helmet>
        <title>POS system</title>
        <meta
          name="description"
          content="Web site created using create-react-app"
        />
      </Helmet>
      <div className="flex flex-col items-center justify-start w-full bg-white-A700 dark:bg-gray-900 min-h-screen">
        <Header className="flex flex-row justify-between items-center w-full p-6 sm:p-5 bg-white-A700" />
        <div className="flex flex-col items-center justify-start w-full mt-[31px] gap-[51px] md:px-5 max-w-[1632px]">
          <div className="p-6 bg-surface-subtle dark:bg-gray-800 rounded-xl2 shadow-card max-w-lg mx-auto mt-5 w-full">
            <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-gray-100">
              Receipt
            </h2>
            <div className="mt-4 p-4 border border-surface-border dark:border-gray-700 rounded-xl2 bg-white-A700 dark:bg-gray-900">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                Recent Sales
              </h3>
              <table className="min-w-full border-collapse mt-2">
                <thead>
                  <tr className="bg-surface-subtle dark:bg-gray-800">
                    <th className="text-left px-2 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      Sale ID
                    </th>
                    <th className="text-left px-2 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      Product ID
                    </th>
                    <th className="text-left px-2 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      Product Name
                    </th>
                    <th className="text-left px-2 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      Price
                    </th>
                    <th className="text-left px-2 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      Quantity
                    </th>
                    <th className="text-left px-2 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                  {salesData.length > 0 ? (
                    salesData.map((sale) => (
                      <tr key={sale.id}>
                        <td className="px-2 py-2 text-gray-800 dark:text-gray-100">{sale.id}</td>
                        <td className="px-2 py-2 text-gray-800 dark:text-gray-100">
                          {sale.product_id}
                        </td>
                        <td className="px-2 py-2 text-gray-800 dark:text-gray-100">
                          {sale.productname}
                        </td>
                        <td className="px-2 py-2 text-gray-800 dark:text-gray-100">
                          {sale.selling_price}
                        </td>
                        <td className="px-2 py-2 text-gray-800 dark:text-gray-100">
                          {sale.quantity}
                        </td>
                        <td className="px-2 py-2 text-gray-800 dark:text-gray-100">
                          {(sale.selling_price * sale.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center py-4 text-gray-500 dark:text-gray-400"
                      >
                        No sales data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <h4 className="text-lg font-bold mt-4 text-gray-800 dark:text-gray-100">
                Total Amount: Rs.{totalAmount.toFixed(2)}
              </h4>
              <p className="text-center mt-2 text-gray-500 dark:text-gray-400">
                Thank you for your purchase!
              </p>
            </div>
            <button
              onClick={() => printReceipt(salesData, totalAmount)}
              className="mt-6 w-full py-2.5 bg-primary-600 text-white-A700 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Print Receipt
            </button>
          </div>
        </div>

        <Footer className="flex justify-center items-center w-full mt-[85px] p-[30px] sm:p-5 bg-gray-800" />
      </div>
    </>
  );
};

export default Receipt;
