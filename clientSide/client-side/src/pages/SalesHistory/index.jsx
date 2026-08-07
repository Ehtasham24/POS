import React, { useEffect, useState } from "react";
import { Text, Modal } from "components";
import { HiOutlineClipboardDocumentList, HiOutlinePrinter } from "react-icons/hi2";
import { printReceipt } from "utils/printReceipt";
import AppShell from "components/AppShell";

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
      <AppShell title="Sales History">
        <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead className="bg-surface-subtle dark:bg-gray-800">
                <tr>
                  <th className="text-left pl-5 pr-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Date/Time
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Items
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Total
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border dark:divide-gray-800">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-16 text-center text-gray-500 dark:text-gray-400">
                      <div className="flex flex-col items-center gap-3">
                        <HiOutlineClipboardDocumentList className="text-3xl text-gray-400" />
                        No past sales found.
                      </div>
                    </td>
                  </tr>
                ) : (
                  batches.map((batch, index) => (
                    <tr key={index} className="transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60">
                      <td className="pl-5 pr-3 py-3 whitespace-nowrap text-gray-800 dark:text-gray-100">
                        {new Date(batch[0].sale_time).toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                          {batch.length} item{batch.length === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap font-medium text-gray-800 dark:text-gray-100">
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
      </AppShell>

      <Modal
        isOpen={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
        title="Order Details"
        maxWidth="max-w-lg"
      >
        {selectedBatch && (
          <>
            <div className="w-full overflow-x-auto mb-4">
            <table className="w-full min-w-[420px] border-collapse">
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
            </div>
            <Text as="p" className="font-semibold !text-gray-800 dark:!text-gray-100 mb-4">
              Total: Rs.{batchTotal(selectedBatch).toFixed(2)}
            </Text>
            <button
              onClick={() =>
                printReceipt(selectedBatch, batchTotal(selectedBatch))
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 py-2.5 font-semibold text-white-A700 transition-colors hover:bg-primary-700"
            >
              <HiOutlinePrinter />
              Print / Duplicate Receipt
            </button>
          </>
        )}
      </Modal>
    </>
  );
}
