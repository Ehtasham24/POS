import React, { useEffect, useState } from "react";
import {
  HiOutlineBanknotes,
  HiOutlineExclamationTriangle,
  HiOutlineArrowTrendingUp,
  HiOutlinePlusCircle,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
} from "react-icons/hi2";
import AddDebitModal from "creditDebitComponents/addDebitModal";
import AddCreditModal from "creditDebitComponents/addCreditModal";
import SettleModal from "creditDebitComponents/settleModal";
import EditTransactionModal from "creditDebitComponents/editTransactionModal";
import PartyHistoryRow from "creditDebitComponents/PartyHistoryRow";
import AppShell from "components/AppShell";
import { Modal, SkeletonRows, EmptyState } from "components";
import { useToast } from "components/Toast/ToastContext";
import { useLanguage } from "i18n/LanguageContext";
import { apiGet, apiPost, apiDelete } from "utils/api";

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

// Rows here are *parties* (one per contact with ≥1 transaction in this direction), with
// balances derived server-side from party_balances — not the old mutable per-row totals.
// The chevron expands into PartyHistoryRow, that party's actual transaction history.
function LedgerTable({
  rows,
  personLabel,
  emptyLabel,
  direction,
  onAddPayment,
  loading,
  historyRefreshKey,
  onEditTransaction,
  onDeleteTransaction,
}) {
  const { t } = useLanguage();
  const [expandedContactId, setExpandedContactId] = useState(null);

  return (
    <div className="overflow-hidden rounded-2xl border border-surface-border dark:border-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead className="bg-surface-subtle dark:bg-gray-800">
            <tr>
              <th className="w-8"></th>
              <th className="text-left pr-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
                <td colSpan={6}>
                  <SkeletonRows count={3} />
                </td>
              </tr>
            </tbody>
          ) : (
          <tbody className="divide-y divide-surface-border dark:divide-gray-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-2">
                  <EmptyState icon={HiOutlineBanknotes} title={emptyLabel} />
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isExpanded = expandedContactId === row.contact_id;
                return (
                  <React.Fragment key={row.contact_id}>
                    <tr className="transition-colors hover:bg-surface-subtle dark:hover:bg-gray-800/60">
                      <td className="pl-3">
                        <button
                          type="button"
                          onClick={() => setExpandedContactId(isExpanded ? null : row.contact_id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                          {isExpanded ? <HiOutlineChevronDown /> : <HiOutlineChevronRight />}
                        </button>
                      </td>
                      <td className="pr-2 py-3 whitespace-nowrap font-medium text-gray-800 dark:text-gray-100">
                        {row.name}
                      </td>
                      <td className="px-2 py-3 text-gray-800 dark:text-gray-100">
                        Rs.{Number(row.total_charged).toFixed(2)}
                      </td>
                      <td className="px-2 py-3 text-gray-800 dark:text-gray-100">
                        Rs.{Number(row.total_paid).toFixed(2)}
                      </td>
                      <td className="px-2 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${pendingBadge(row.balance)}`}>
                          Rs.{Number(row.balance).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 pr-5 text-right whitespace-nowrap">
                        {Number(row.balance) > 0 && (
                          <button
                            onClick={() => onAddPayment(row)}
                            className="px-3 py-1.5 bg-surface-muted dark:bg-gray-700 hover:bg-surface-border dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs font-bold uppercase rounded-lg transition-colors"
                          >
                            {t("creditDebit.settle")}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <PartyHistoryRow
                        contactId={row.contact_id}
                        direction={direction}
                        colSpan={6}
                        refreshKey={historyRefreshKey}
                        onEditTransaction={onEditTransaction}
                        onDeleteTransaction={onDeleteTransaction}
                      />
                    )}
                  </React.Fragment>
                );
              })
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
  const [payableParties, setPayableParties] = useState([]);
  const [receivableParties, setReceivableParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalProfitLoss, setTotalProfitLoss] = useState(0);
  const [showAddDebit, setShowAddDebit] = useState(false);
  const [showAddCredit, setShowAddCredit] = useState(false);
  const [settleTarget, setSettleTarget] = useState(null); // { entry, type }
  const [editTx, setEditTx] = useState(null);
  const [deleteTx, setDeleteTx] = useState(null);
  const [deletingTx, setDeletingTx] = useState(false);
  // Bumped after any add/edit/delete/settle so a currently-expanded history row refetches
  // even though PartyHistoryRow's own effect is keyed on contactId/direction, not on data
  // it doesn't own.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const fetchLedger = async () => {
    try {
      const [payable, receivable] = await Promise.all([
        apiGet("/api/parties?direction=payable"),
        apiGet("/api/parties?direction=receivable"),
      ]);
      setPayableParties(payable);
      setReceivableParties(receivable);
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
    setHistoryRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingDebitTotal = payableParties.reduce((sum, p) => sum + Number(p.balance), 0);
  const pendingCreditTotal = receivableParties.reduce((sum, p) => sum + Number(p.balance), 0);
  // Profit realized so far, minus what we still owe suppliers, plus what customers still owe us.
  const netEarnings = totalProfitLoss - pendingDebitTotal + pendingCreditTotal;

  const handleDeleteTx = async () => {
    setDeletingTx(true);
    try {
      await apiDelete(`/api/parties/transactions/${deleteTx.id}`);
      toast.success(t("creditDebit.entryDeleted"));
      setDeleteTx(null);
      refreshAll();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeletingTx(false);
    }
  };

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
              rows={payableParties}
              personLabel={t("creditDebit.supplier")}
              emptyLabel={t("creditDebit.noPayables")}
              direction="payable"
              onAddPayment={(row) => setSettleTarget({ entry: row, type: "debit" })}
              loading={loading}
              historyRefreshKey={historyRefreshKey}
              onEditTransaction={setEditTx}
              onDeleteTransaction={setDeleteTx}
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
              rows={receivableParties}
              personLabel={t("creditDebit.customer")}
              emptyLabel={t("creditDebit.noReceivables")}
              direction="receivable"
              onAddPayment={(row) => setSettleTarget({ entry: row, type: "credit" })}
              loading={loading}
              historyRefreshKey={historyRefreshKey}
              onEditTransaction={setEditTx}
              onDeleteTransaction={setDeleteTx}
            />
          </div>
        </div>
      </AppShell>

      <AddDebitModal isOpen={showAddDebit} onClose={() => setShowAddDebit(false)} onAdded={refreshAll} />
      <AddCreditModal isOpen={showAddCredit} onClose={() => setShowAddCredit(false)} onAdded={refreshAll} />
      <SettleModal
        isOpen={!!settleTarget}
        onClose={() => setSettleTarget(null)}
        entry={settleTarget?.entry}
        type={settleTarget?.type}
        onSettled={refreshAll}
      />
      <EditTransactionModal
        isOpen={!!editTx}
        onClose={() => setEditTx(null)}
        transaction={editTx}
        onUpdated={refreshAll}
      />

      <Modal isOpen={!!deleteTx} onClose={() => setDeleteTx(null)} title={t("common.delete")}>
        {deleteTx && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-danger-50 p-4 text-danger-700 dark:bg-danger-500/10 dark:text-danger-400">
              <HiOutlineExclamationTriangle className="mt-0.5 shrink-0 text-lg" />
              <p className="text-sm">{t("creditDebit.confirmDeleteEntry")}</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTx(null)}
                disabled={deletingTx}
                className="flex-1 rounded-lg bg-surface-muted py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-surface-border disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
              >
                {t("sell.cancel")}
              </button>
              <button
                type="button"
                onClick={handleDeleteTx}
                disabled={deletingTx}
                className="flex-1 rounded-lg bg-danger-600 py-2.5 text-sm font-semibold text-white-A700 transition-colors hover:bg-danger-700 disabled:opacity-50"
              >
                {deletingTx ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
