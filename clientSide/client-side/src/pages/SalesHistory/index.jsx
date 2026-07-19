import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import Header from "components/Header";
import Footer from "components/Footer";
import { Heading, Text, Modal } from "components";
import { printReceipt } from "utils/printReceipt";

const batchTotal = (batch) =>
  batch.reduce((sum, sale) => sum + sale.selling_price * sale.quantity, 0);

export default function SalesHistoryPage() {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);

  const fetchHistory = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/BilledHistory");
      if (!response.ok) {
        throw new Error("Failed to fetch sales history: " + response.status);
      }
      const data = await response.json();
      // Most recent batch first
      setBatches([...data].reverse());
    } catch (error) {
      console.error("Error fetching sales history:", error);
    }
  };

  useEffect(() => {
    fetchHistory();
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
        <div className="flex flex-col items-center justify-start w-full mt-[31px] gap-8 md:px-5 max-w-[1632px]">
          <Heading as="h1">Sales History</Heading>

          <div className="w-full max-w-4xl rounded-xl2 border border-surface-border dark:border-gray-700 overflow-hidden">
            <table className="w-full border-collapse">
              <thead className="bg-surface-subtle dark:bg-gray-800">
                <tr>
                  <th className="text-left pl-5 py-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Date/Time
                  </th>
                  <th className="text-left py-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Items
                  </th>
                  <th className="text-left py-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Total
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-gray-500 dark:text-gray-400">
                      No past sales found.
                    </td>
                  </tr>
                ) : (
                  batches.map((batch, index) => (
                    <tr key={index} className="even:bg-surface-subtle dark:even:bg-gray-800">
                      <td className="pl-5 py-3 text-gray-800 dark:text-gray-100">
                        {new Date(batch[0].sale_time).toLocaleString()}
                      </td>
                      <td className="py-3 text-gray-800 dark:text-gray-100">{batch.length}</td>
                      <td className="py-3 text-gray-800 dark:text-gray-100">
                        Rs.{batchTotal(batch).toFixed(2)}
                      </td>
                      <td className="py-3 pr-5 text-right">
                        <button
                          onClick={() => setSelectedBatch(batch)}
                          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white-A700 text-xs font-bold uppercase rounded-lg transition-colors"
                        >
                          View / Reprint
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Footer className="flex justify-center items-center w-full mt-[85px] p-[30px] sm:p-5 bg-gray-800" />
      </div>

      <Modal
        isOpen={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
        title="Order Details"
        maxWidth="max-w-lg"
      >
        {selectedBatch && (
          <>
            <table className="w-full border-collapse mb-4">
              <thead>
                <tr className="bg-surface-subtle dark:bg-gray-700">
                  <th className="text-left px-2 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Product
                  </th>
                  <th className="text-left px-2 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Price
                  </th>
                  <th className="text-left px-2 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Qty
                  </th>
                  <th className="text-left px-2 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                {selectedBatch.map((sale) => (
                  <tr key={sale.id}>
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
                ))}
              </tbody>
            </table>
            <Text as="p" className="font-semibold !text-gray-800 dark:!text-gray-100 mb-4">
              Total: Rs.{batchTotal(selectedBatch).toFixed(2)}
            </Text>
            <button
              onClick={() =>
                printReceipt(selectedBatch, batchTotal(selectedBatch))
              }
              className="w-full py-2.5 bg-primary-600 text-white-A700 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Print / Duplicate Receipt
            </button>
          </>
        )}
      </Modal>
    </>
  );
}
