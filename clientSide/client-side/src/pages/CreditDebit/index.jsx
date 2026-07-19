import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import Header from "components/Header";
import Footer from "components/Footer";
import { Heading, Text } from "components";
import AddDebitModal from "creditDebitComponents/addDebitModal";
import AddCreditModal from "creditDebitComponents/addCreditModal";
import SettleModal from "creditDebitComponents/settleModal";

const rowClass = "even:bg-surface-subtle dark:even:bg-gray-800";

export default function CreditDebitPage() {
  const [debit, setDebit] = useState([]);
  const [credit, setCredit] = useState([]);
  const [totalProfitLoss, setTotalProfitLoss] = useState(0);
  const [showAddDebit, setShowAddDebit] = useState(false);
  const [showAddCredit, setShowAddCredit] = useState(false);
  const [settleTarget, setSettleTarget] = useState(null); // { entry, type }

  const fetchLedger = async () => {
    try {
      const response = await fetch("http://localhost:4000/creditsDebits");
      if (!response.ok) throw new Error("Failed to fetch ledger");
      const data = await response.json();
      setDebit(data.Debit || []);
      setCredit(data.Credit || []);
    } catch (error) {
      console.error("Error fetching credit/debit ledger:", error);
    }
  };

  const fetchEarnings = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/Sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2000-01-01T00:00",
          endDate: new Date().toISOString().slice(0, 16),
        }),
      });
      if (!response.ok) throw new Error("Failed to fetch earnings");
      const data = await response.json();
      setTotalProfitLoss(data.totalProfitLoss || 0);
    } catch (error) {
      console.error("Error fetching earnings:", error);
    }
  };

  const refreshAll = () => {
    fetchLedger();
    fetchEarnings();
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const pendingDebitTotal = debit.reduce(
    (sum, d) => sum + Number(d.amount_pending),
    0
  );
  const netEarnings = totalProfitLoss - pendingDebitTotal;

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
          <Heading as="h1">Credit / Debit</Heading>

          <div className="w-full max-w-4xl grid grid-cols-3 md:grid-cols-1 gap-4">
            <div className="bg-surface-subtle dark:bg-gray-800 rounded-xl2 p-5">
              <Text as="p" className="!text-gray-500 text-sm">
                Total Profit (all-time)
              </Text>
              <Text as="p" className="!text-gray-800 dark:!text-gray-100 text-2xl font-bold">
                Rs.{Number(totalProfitLoss).toFixed(2)}
              </Text>
            </div>
            <div className="bg-surface-subtle dark:bg-gray-800 rounded-xl2 p-5">
              <Text as="p" className="!text-gray-500 text-sm">
                Pending Payables
              </Text>
              <Text as="p" className="!text-danger-600 text-2xl font-bold">
                Rs.{pendingDebitTotal.toFixed(2)}
              </Text>
            </div>
            <div className="bg-surface-subtle dark:bg-gray-800 rounded-xl2 p-5">
              <Text as="p" className="!text-gray-500 text-sm">
                Net Earnings
              </Text>
              <Text
                as="p"
                className={`text-2xl font-bold ${
                  netEarnings >= 0 ? "!text-success-600" : "!text-danger-600"
                }`}
              >
                Rs.{netEarnings.toFixed(2)}
              </Text>
            </div>
          </div>

          <div className="w-full max-w-4xl flex flex-col gap-8">
            {/* Payable / Debit */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Heading as="h2" size="xs">
                  Payable — You owe suppliers
                </Heading>
                <button
                  onClick={() => setShowAddDebit(true)}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white-A700 text-xs font-bold uppercase rounded-lg transition-colors"
                >
                  Add Payable
                </button>
              </div>
              <div className="rounded-xl2 border border-surface-border dark:border-gray-700 overflow-hidden">
                <table className="w-full border-collapse">
                  <thead className="bg-surface-subtle dark:bg-gray-800">
                    <tr>
                      <th className="text-left pl-4 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Supplier
                      </th>
                      <th className="text-left py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Due
                      </th>
                      <th className="text-left py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Paid
                      </th>
                      <th className="text-left py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Pending
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                    {debit.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">
                          No payables recorded.
                        </td>
                      </tr>
                    ) : (
                      debit.map((d) => (
                        <tr key={d.id} className={rowClass}>
                          <td className="pl-4 py-2 text-gray-800 dark:text-gray-100">{d.name}</td>
                          <td className="py-2 text-gray-800 dark:text-gray-100">{d.amount_due}</td>
                          <td className="py-2 text-gray-800 dark:text-gray-100">{d.amount_received}</td>
                          <td className="py-2 text-gray-800 dark:text-gray-100">{d.amount_pending}</td>
                          <td className="py-2 pr-4 text-right">
                            {Number(d.amount_pending) > 0 && (
                              <button
                                onClick={() => setSettleTarget({ entry: d, type: "debit" })}
                                className="px-3 py-1.5 bg-surface-muted dark:bg-gray-700 hover:bg-surface-border dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs font-bold uppercase rounded-lg transition-colors"
                              >
                                Settle
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Receivable / Credit */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Heading as="h2" size="xs">
                  Receivable — Customers owe you
                </Heading>
                <button
                  onClick={() => setShowAddCredit(true)}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white-A700 text-xs font-bold uppercase rounded-lg transition-colors"
                >
                  Add Receivable
                </button>
              </div>
              <div className="rounded-xl2 border border-surface-border dark:border-gray-700 overflow-hidden">
                <table className="w-full border-collapse">
                  <thead className="bg-surface-subtle dark:bg-gray-800">
                    <tr>
                      <th className="text-left pl-4 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Customer
                      </th>
                      <th className="text-left py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Due
                      </th>
                      <th className="text-left py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Paid
                      </th>
                      <th className="text-left py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Pending
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                    {credit.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">
                          No receivables recorded.
                        </td>
                      </tr>
                    ) : (
                      credit.map((c) => (
                        <tr key={c.id} className={rowClass}>
                          <td className="pl-4 py-2 text-gray-800 dark:text-gray-100">{c.name}</td>
                          <td className="py-2 text-gray-800 dark:text-gray-100">{c.amount_due}</td>
                          <td className="py-2 text-gray-800 dark:text-gray-100">{c.amount_received}</td>
                          <td className="py-2 text-gray-800 dark:text-gray-100">{c.amount_pending}</td>
                          <td className="py-2 pr-4 text-right">
                            {Number(c.amount_pending) > 0 && (
                              <button
                                onClick={() => setSettleTarget({ entry: c, type: "credit" })}
                                className="px-3 py-1.5 bg-surface-muted dark:bg-gray-700 hover:bg-surface-border dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs font-bold uppercase rounded-lg transition-colors"
                              >
                                Settle
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <Footer className="flex justify-center items-center w-full mt-[85px] p-[30px] sm:p-5 bg-gray-800" />
      </div>

      <AddDebitModal
        isOpen={showAddDebit}
        onClose={() => setShowAddDebit(false)}
        onAdded={fetchLedger}
      />
      <AddCreditModal
        isOpen={showAddCredit}
        onClose={() => setShowAddCredit(false)}
        onAdded={fetchLedger}
      />
      <SettleModal
        isOpen={!!settleTarget}
        onClose={() => setSettleTarget(null)}
        entry={settleTarget?.entry}
        type={settleTarget?.type}
        onSettled={refreshAll}
      />
    </>
  );
}
