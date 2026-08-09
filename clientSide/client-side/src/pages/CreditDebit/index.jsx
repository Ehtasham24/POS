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
import { SkeletonRows, EmptyState } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet, apiPost } from "utils/api";

const pendingBadge = (amount) =>
  Number(amount) > 0
    ? "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400"
    : "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500";

const statCards = (t, totalProfitLoss, pendingDebitTotal, pendingCreditTotal, netEarnings) => [
  {
    label: t("creditDebit.totalProfit"),
    value: `Rs.${Number(totalProfitLoss).toFixed(2)}`,
    icon: HiOutlineArrowTrendingUp,
    tint: "bg-primary-50 text-primary-600 dark:bg-gray-700 dark:text-primary-400",
    valueClass: "text-gray-800 dark:text-gray-100",
  },
  {
    label: t("creditDebit.pendingPayables"),
    value: `Rs.${pendingDebitTotal.toFixed(2)}`,
    icon: HiOutlineExclamationTriangle,
    tint: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    valueClass: "text-danger-600",
  },
  {
    label: t("creditDebit.pendingReceivables"),
    value: `Rs.${pendingCreditTotal.toFixed(2)}`,
    icon: HiOutlineBanknotes,
    tint: "bg-primary-50 text-primary-600 dark:bg-gray-700 dark:text-primary-400",
    valueClass: "text-primary-600 dark:text-primary-400",
  },
  {
    label: t("creditDebit.netEarnings"),
    value: `Rs.${netEarnings.toFixed(2)}`,
    icon: HiOutlineBanknotes,
    tint:
      netEarnings >= 0
        ? "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500"
        : "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400",
    valueClass: netEarnings >= 0 ? "text-success-600" : "text-danger-600",
  },
];

function LedgerTable({ rows, personLabel, emptyLabel, onSettle, onEdit, loading }) {
  const { t } = useLanguage();
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
                {t("creditDebit.due")}
              </th>
              <th className="text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("creditDebit.paid")}
              </th>
              <th className="text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("creditDebit.pending")}
              </th>
              <th></th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              <tr>
                <td colSpan={5}>
                  <SkeletonRows count={3} />
                </td>
              </tr>
            </tbody>
          ) : (
          <tbody className="divide-y divide-surface-border dark:divide-gray-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-2">
                  <EmptyState icon={HiOutlineBanknotes} title={emptyLabel} />
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
                      {t("common.edit")}
                    </button>
                    {Number(row.amount_pending) > 0 && (
                      <button
                        onClick={() => onSettle(row)}
                        className="px-3 py-1.5 bg-surface-muted dark:bg-gray-700 hover:bg-surface-border dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs font-bold uppercase rounded-lg transition-colors"
                      >
                        {t("creditDebit.settle")}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

export default function CreditDebitPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const [debit, setDebit] = useState([]);
  const [credit, setCredit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalProfitLoss, setTotalProfitLoss] = useState(0);
  const [showAddDebit, setShowAddDebit] = useState(false);
  const [showAddCredit, setShowAddCredit] = useState(false);
  const [editDebitEntry, setEditDebitEntry] = useState(null);
  const [editCreditEntry, setEditCreditEntry] = useState(null);
  const [settleTarget, setSettleTarget] = useState(null); // { entry, type }

  const fetchLedger = async () => {
    try {
      const data = await apiGet("/creditsDebits");
      setDebit(data.Debit || []);
      setCredit(data.Credit || []);
    } catch (error) {
      console.error("Error fetching credit/debit ledger:", error);
      toast.error("Couldn't load the ledger — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchEarnings = async () => {
    try {
      const data = await apiPost("/api/Sales", {
        startDate: "2000-01-01T00:00",
        endDate: new Date().toISOString().slice(0, 16),
      });
      setTotalProfitLoss(data.totalProfitLoss || 0);
    } catch (error) {
      console.error("Error fetching earnings:", error);
      toast.error("Couldn't load earnings totals — check your connection and try again.");
    }
  };

  const refreshAll = () => {
    fetchLedger();
    fetchEarnings();
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <AppShell title={t("creditDebit.title")}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-1 max-w-4xl">
          {statCards(t, totalProfitLoss, pendingDebitTotal, pendingCreditTotal, netEarnings).map((card) => (
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
                {t("creditDebit.payableTitle")}
              </h2>
              <button
                onClick={() => setShowAddDebit(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white-A700 text-xs font-bold uppercase rounded-lg transition-colors"
              >
                <HiOutlinePlusCircle className="text-sm" />
                {t("creditDebit.addPayable")}
              </button>
            </div>
            <LedgerTable
              rows={debit}
              personLabel={t("creditDebit.supplier")}
              emptyLabel={t("creditDebit.noPayables")}
              onSettle={(row) => setSettleTarget({ entry: row, type: "debit" })}
              onEdit={(row) => setEditDebitEntry(row)}
              loading={loading}
            />
          </div>

          {/* Receivable / Credit */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-poppins text-lg font-bold text-gray-800 dark:text-gray-100">
                {t("creditDebit.receivableTitle")}
              </h2>
              <button
                onClick={() => setShowAddCredit(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white-A700 text-xs font-bold uppercase rounded-lg transition-colors"
              >
                <HiOutlinePlusCircle className="text-sm" />
                {t("creditDebit.addReceivable")}
              </button>
            </div>
            <LedgerTable
              rows={credit}
              personLabel={t("creditDebit.customer")}
              emptyLabel={t("creditDebit.noReceivables")}
              onSettle={(row) => setSettleTarget({ entry: row, type: "credit" })}
              onEdit={(row) => setEditCreditEntry(row)}
              loading={loading}
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
