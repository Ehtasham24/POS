import React, { useEffect, useRef, useState } from "react";
import {
  HiOutlineBanknotes,
  HiOutlineExclamationTriangle,
  HiOutlineArrowTrendingUp,
  HiOutlinePlusCircle,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineEllipsisVertical,
  HiOutlineCreditCard,
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

// Two actions (Add Charge + Settle) as separate buttons forced the table wider than its
// scroll container, so reaching Settle needed a horizontal scroll — collapsed into one
// compact dropdown instead, matching pages/Inventory/index.jsx's RowActionsMenu pattern.
function PartyActionsMenu({ balance, onAddCharge, onSettle }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Row actions"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <HiOutlineEllipsisVertical className="text-lg" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl border border-surface-border bg-white-A700 shadow-modal dark:border-gray-700 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddCharge();
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-gray-800 transition-colors hover:bg-surface-subtle dark:text-gray-100 dark:hover:bg-gray-700"
          >
            <HiOutlinePlusCircle className="text-base" />
            {t("creditDebit.addCharge")}
          </button>
          {Number(balance) > 0 && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSettle();
              }}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-500/10"
            >
              <HiOutlineCreditCard className="text-base" />
              {t("creditDebit.settle")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Rows here are *parties* (one per contact with ≥1 transaction in this direction), with
// balances derived server-side from party_balances — not the old mutable per-row totals.
// The chevron expands into PartyHistoryRow, that party's actual transaction history.
function LedgerTable({
  rows,
  personLabel,
  emptyLabel,
  direction,
  onAddPayment,
  onAddCharge,
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
        {/* No min-w here (unlike other tables in the app) — the row content is compact
            (name, three short amounts, a single icon-button menu) and a wide floor was
            forcing a horizontal scrollbar even on containers that already fit it. */}
        <table className="w-full border-collapse">
          <thead className="bg-surface-subtle dark:bg-gray-800">
            <tr>
              <th className="w-8"></th>
              <th className="w-[30%] text-left pr-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {personLabel}
              </th>
              <th className="w-[18%] text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("creditDebit.due")}
              </th>
              <th className="w-[18%] text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("creditDebit.paid")}
              </th>
              <th className="w-[18%] text-left px-2 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t("creditDebit.pending")}
              </th>
              <th className="w-12"></th>
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
                        <PartyActionsMenu
                          balance={row.balance}
                          onAddCharge={() => onAddCharge(row)}
                          onSettle={() => onAddPayment(row)}
                        />
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
  // Per-row "Add Charge" — same Add Payable/Receivable modal, opened with the contact
  // already known instead of the page-level button's blank picker.
  const [chargeTarget, setChargeTarget] = useState(null); // { row, direction }
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
              onAddCharge={(row) => setChargeTarget({ row, direction: "payable" })}
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
              onAddCharge={(row) => setChargeTarget({ row, direction: "receivable" })}
              loading={loading}
              historyRefreshKey={historyRefreshKey}
              onEditTransaction={setEditTx}
              onDeleteTransaction={setDeleteTx}
            />
          </div>
        </div>
      </AppShell>

      <AddDebitModal
        isOpen={showAddDebit || chargeTarget?.direction === "payable"}
        onClose={() => {
          setShowAddDebit(false);
          setChargeTarget(null);
        }}
        onAdded={refreshAll}
        presetContactId={chargeTarget?.direction === "payable" ? chargeTarget.row.contact_id : undefined}
      />
      <AddCreditModal
        isOpen={showAddCredit || chargeTarget?.direction === "receivable"}
        onClose={() => {
          setShowAddCredit(false);
          setChargeTarget(null);
        }}
        onAdded={refreshAll}
        presetContactId={chargeTarget?.direction === "receivable" ? chargeTarget.row.contact_id : undefined}
      />
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
