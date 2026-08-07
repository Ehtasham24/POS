import React, { useEffect, useState } from "react";
import {
  HiOutlineBanknotes,
  HiOutlineExclamationTriangle,
  HiOutlineArrowTrendingUp,
  HiOutlinePlusCircle,
  HiOutlinePencil,
} from "react-icons/hi2";
import AddDebitModal from "creditDebitComponents/addDebitModal";
import AddCreditModal from "creditDebitComponents/addCreditModal";
import SettleModal from "creditDebitComponents/settleModal";
import AppShell from "components/AppShell";

const pendingBadge = (amount) =>
  Number(amount) > 0
    ? "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400"
    : "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500";

const statCards = (totalProfitLoss, pendingDebitTotal, pendingCreditTotal, netEarnings) => [
  {
    label: "Total Profit (all-time)",
    value: `Rs.${Number(totalProfitLoss).toFixed(2)}`,
    icon: HiOutlineArrowTrendingUp,
    tint: "bg-primary-50 text-primary-600 dark:bg-gray-700 dark:text-primary-400",
    valueClass: "text-gray-800 dark:text-gray-100",
  },
  {
    label: "Pending Payables",
    value: `Rs.${pendingDebitTotal.toFixed(2)}`,
    icon: HiOutlineExclamationTriangle,
    tint: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    valueClass: "text-danger-600",
  },
  {
    label: "Pending Receivables",
    value: `Rs.${pendingCreditTotal.toFixed(2)}`,
    icon: HiOutlineBanknotes,
    tint: "bg-primary-50 text-primary-600 dark:bg-gray-700 dark:text-primary-400",
    valueClass: "text-primary-600 dark:text-primary-400",
  },
  {
    label: "Net Earnings",
    value: `Rs.${netEarnings.toFixed(2)}`,
    icon: HiOutlineBanknotes,
    tint:
      netEarnings >= 0
        ? "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500"
        : "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400",
    valueClass: netEarnings >= 0 ? "text-success-600" : "text-danger-600",
  },
];

function LedgerTable({ rows, personLabel, emptyLabel, onSettle, onEdit }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead className="bg-surface-subtle dark:bg-gray-800">
            <tr>
              <th className="text-left pl-5 pr-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {personLabel}
              </th>
              <th className="text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Due
              </th>
              <th className="text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Paid
              </th>
              <th className="text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Pending
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border dark:divide-gray-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60">
                  <td className="pl-5 pr-2 py-3 whitespace-nowrap font-medium text-gray-800 dark:text-gray-100">
                    {row.name}
                  </td>
                  <td className="px-2 py-3 text-gray-800 dark:text-gray-100">{row.amount_due}</td>
                  <td className="px-2 py-3 text-gray-800 dark:text-gray-100">{row.amount_received}</td>
                  <td className="px-2 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${pendingBadge(row.amount_pending)}`}>
                      {row.amount_pending}
                    </span>
                  </td>
                  <td className="py-3 pr-5 text-right whitespace-nowrap space-x-2">
                    <button
                      onClick={() => onEdit(row)}
                      aria-label={`Edit ${row.name}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-surface-muted dark:bg-gray-700 hover:bg-surface-border dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs font-bold uppercase rounded-lg transition-colors"
                    >
                      <HiOutlinePencil className="text-sm" />
                      Edit
                    </button>
                    {Number(row.amount_pending) > 0 && (
                      <button
                        onClick={() => onSettle(row)}
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
  );
}

export default function CreditDebitPage() {
  const [debit, setDebit] = useState([]);
  const [credit, setCredit] = useState([]);
  const [totalProfitLoss, setTotalProfitLoss] = useState(0);
  const [showAddDebit, setShowAddDebit] = useState(false);
  const [showAddCredit, setShowAddCredit] = useState(false);
  const [editDebitEntry, setEditDebitEntry] = useState(null);
  const [editCreditEntry, setEditCreditEntry] = useState(null);
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
  const pendingCreditTotal = credit.reduce(
    (sum, c) => sum + Number(c.amount_pending),
    0
  );
  // Profit realized so far, minus what we still owe suppliers, plus what customers still owe us.
  const netEarnings = totalProfitLoss - pendingDebitTotal + pendingCreditTotal;

  return (
    <>
      <AppShell title="Credit / Debit">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-1 max-w-4xl">
          {statCards(totalProfitLoss, pendingDebitTotal, pendingCreditTotal, netEarnings).map((card) => (
            <div
              key={card.label}
              className="flex items-center gap-4 rounded-2xl border border-surface-border bg-white-A700 p-5 shadow-card dark:border-gray-700 dark:bg-gray-800"
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.tint}`}>
                <card.icon className="text-xl" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                <p className={`truncate font-poppins text-xl font-bold ${card.valueClass}`}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex max-w-4xl flex-col gap-8">
          {/* Payable / Debit */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                Payable — You owe suppliers
              </h2>
              <button
                onClick={() => setShowAddDebit(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white-A700 text-xs font-bold uppercase rounded-lg transition-colors"
              >
                <HiOutlinePlusCircle className="text-sm" />
                Add Payable
              </button>
            </div>
            <LedgerTable
              rows={debit}
              personLabel="Supplier"
              emptyLabel="No payables recorded."
              onSettle={(row) => setSettleTarget({ entry: row, type: "debit" })}
              onEdit={(row) => setEditDebitEntry(row)}
            />
          </div>

          {/* Receivable / Credit */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                Receivable — Customers owe you
              </h2>
              <button
                onClick={() => setShowAddCredit(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white-A700 text-xs font-bold uppercase rounded-lg transition-colors"
              >
                <HiOutlinePlusCircle className="text-sm" />
                Add Receivable
              </button>
            </div>
            <LedgerTable
              rows={credit}
              personLabel="Customer"
              emptyLabel="No receivables recorded."
              onSettle={(row) => setSettleTarget({ entry: row, type: "credit" })}
              onEdit={(row) => setEditCreditEntry(row)}
            />
          </div>
        </div>
      </AppShell>

      <AddDebitModal
        isOpen={showAddDebit || !!editDebitEntry}
        onClose={() => {
          setShowAddDebit(false);
          setEditDebitEntry(null);
        }}
        onAdded={fetchLedger}
        entry={editDebitEntry}
      />
      <AddCreditModal
        isOpen={showAddCredit || !!editCreditEntry}
        onClose={() => {
          setShowAddCredit(false);
          setEditCreditEntry(null);
        }}
        onAdded={fetchLedger}
        entry={editCreditEntry}
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
