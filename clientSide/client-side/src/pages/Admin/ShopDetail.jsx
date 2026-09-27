import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineClipboardDocument, HiOutlineTrash } from "react-icons/hi2";
import { Modal, SkeletonRows } from "components";
import { useToast } from "components/Toast/ToastContext";
import { apiGet, apiPost, apiPatch, apiDelete } from "utils/api";
import { formatPKR } from "utils/money";
import {
  cardClass,
  inputClass,
  labelClass,
  thClass,
  tdClass,
  buttonClass,
  formatDateTime,
  formatDay,
  timeAgo,
  SubscriptionChip,
  TIER_CHIP_CLASS,
  AUDIT_ACTION_LABEL,
  auditDetails,
} from "./shared";

const TABS = [
  ["summary", "Summary"],
  ["users", "Users"],
  ["billing", "Billing"],
  ["activity", "Activity"],
];

const PAYMENT_METHODS = [
  ["cash", "Cash"],
  ["bank_transfer", "Bank transfer"],
  ["jazzcash", "JazzCash"],
  ["easypaisa", "Easypaisa"],
  ["card", "Card"],
  ["other", "Other"],
  ["trial", "Free trial"],
  ["waiver", "Waived (free)"],
];
const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS);
const FREE_METHODS = ["trial", "waiver"];
const emptyPayment = { method: "cash", amount: "", months: 1, coversFrom: "", reference: "", note: "" };

const chipClass = (active) =>
  `rounded-full px-3 py-1 text-sm font-medium transition-colors ${
    active
      ? "bg-primary-600 text-white-A700"
      : "bg-surface-muted text-gray-700 hover:bg-surface-border dark:bg-gray-700 dark:text-gray-200"
  }`;

function Fact({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-semibold text-gray-800 dark:text-gray-100">{value}</dd>
    </div>
  );
}

// One shop in detail (GET /api/admin/shops/:id/detail), opened from the Shops page — or from
// anywhere else in the console via /admin/shops?shop=<id>. `onChanged` lets the Shops list
// refresh after a change made here.
export default function ShopDetail({ shopId, onClose, onChanged }) {
  const toast = useToast();
  const [tab, setTab] = useState("summary");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(null);
  const [issuedPassword, setIssuedPassword] = useState(null);
  const [payment, setPayment] = useState(emptyPayment);

  const load = async () => {
    try {
      setDetail(await apiGet(`/api/admin/shops/${shopId}/detail`));
    } catch (err) {
      toast.error(err.message);
      onClose();
    }
  };

  useEffect(() => {
    setDetail(null);
    setTab("summary");
    setIssuedPassword(null);
    if (shopId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // Every change here: run it, show the result, reload this panel and the list behind it.
  const act = async (key, run, success) => {
    setBusy(key);
    try {
      const result = await run();
      if (success) toast.success(success);
      await load();
      onChanged?.();
      return result;
    } catch (err) {
      toast.error(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const toggleUser = (user) => {
    const verb = user.is_active ? "Deactivate" : "Reactivate";
    if (
      !window.confirm(
        `${verb} ${user.display_name} (${user.username})?${user.is_active && user.role === "owner" ? " They won't be able to sign in or manage the shop." : ""}`,
      )
    )
      return;
    act(
      `user-${user.id}`,
      () => apiPatch(`/api/admin/shops/${shopId}/users/${user.id}/active`, { isActive: !user.is_active }),
      `${user.display_name} ${user.is_active ? "deactivated" : "reactivated"}.`,
    );
  };

  const resetPassword = async (user) => {
    if (!window.confirm(`Give ${user.display_name} a new temporary password? Their current one stops working.`)) return;
    const result = await act(`reset-${user.id}`, () => apiPost(`/api/admin/shops/${shopId}/users/${user.id}/reset-password`));
    if (result) setIssuedPassword({ ...result, userId: user.id });
  };

  const recordPayment = async (e) => {
    e.preventDefault();
    const free = FREE_METHODS.includes(payment.method);
    const saved = await act(
      "payment",
      () =>
        apiPost(`/api/admin/shops/${shopId}/payments`, {
          method: payment.method,
          amount: free ? 0 : Number(payment.amount),
          months: Number(payment.months),
          coversFrom: payment.coversFrom || null,
          reference: payment.reference,
          note: payment.note,
        }),
      "Payment recorded.",
    );
    if (saved) setPayment(emptyPayment);
  };

  const deletePayment = (p) => {
    if (
      !window.confirm(
        `Delete the ${METHOD_LABEL[p.method]} entry for ${formatDay(p.covers_from)} – ${formatDay(p.covers_until)}?`,
      )
    )
      return;
    act(`payment-${p.id}`, () => apiDelete(`/api/admin/shops/${shopId}/payments/${p.id}`), "Payment deleted.");
  };

  const shop = detail?.shop;
  const sub = detail?.subscription;
  const paymentField = (key) => ({
    value: payment[key],
    onChange: (e) => setPayment((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <Modal isOpen={!!shopId} onClose={onClose} title={shop ? shop.name : "Shop"} maxWidth="max-w-4xl">
      {!detail ? (
        <SkeletonRows count={6} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TIER_CHIP_CLASS[shop.tier]}`}>
              {shop.tier}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                shop.is_active
                  ? "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-500"
                  : "bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-500"
              }`}
            >
              {shop.is_active ? "Active" : "Inactive"}
            </span>
            <SubscriptionChip subscription={sub} />
            <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className={`h-2 w-2 rounded-full ${shop.onlineNow ? "bg-success-500" : "bg-gray-400"}`} />
              {shop.onlineNow
                ? "Online now"
                : shop.lastSeenAt
                  ? `Last active ${timeAgo(shop.lastSeenAt)}`
                  : `Last sign-in ${timeAgo(shop.last_login_at)}`}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={chipClass(tab === key)}>
                {label}
                {key === "users" && ` (${detail.users.length})`}
              </button>
            ))}
          </div>

          {tab === "summary" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-1">
                {[
                  ["Today", detail.activity.today],
                  ["Last 7 days", detail.activity.last7Days],
                  ["Last 30 days", detail.activity.last30Days],
                ].map(([label, v]) => (
                  <div key={label} className={`${cardClass} p-4`}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="mt-1 font-poppins text-xl font-bold text-gray-800 dark:text-gray-100">{formatPKR(v.revenue)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{v.receipts.toLocaleString()} receipts</p>
                  </div>
                ))}
              </div>
              <dl className={`${cardClass} grid grid-cols-3 gap-4 p-4 text-sm sm:grid-cols-2`}>
                <Fact label="Last sale" value={timeAgo(shop.last_sale_at)} />
                <Fact label="Last sign-in" value={timeAgo(shop.last_login_at)} />
                <Fact label="Products" value={detail.activity.products.toLocaleString()} />
                <Fact label="Open shifts" value={detail.activity.openShifts} />
                <Fact
                  label="Users"
                  value={`${detail.users.filter((u) => u.is_active).length} active / ${shop.max_users} allowed`}
                />
                <Fact label="Next payment due" value={sub.dueOn ? formatDay(sub.dueOn) : "Not billed"} />
                <Fact label="Timezone" value={shop.timezone} />
                <Fact label="Created" value={formatDay(shop.created_at)} />
                <Fact
                  label="Storage quota"
                  value={shop.storage_quota_percent != null ? `${shop.storage_quota_percent}% of DB` : "Unlimited"}
                />
              </dl>
            </div>
          )}

          {tab === "users" && (
            <div className="space-y-3">
              {issuedPassword && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <p>
                    Temporary password for <strong>{issuedPassword.username}</strong> — shown only now. They'll be asked to choose
                    a new one when they sign in.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="rounded bg-white-A700 px-3 py-1.5 font-mono text-base tracking-wider text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                      {issuedPassword.tempPassword}
                    </code>
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard?.writeText(issuedPassword.tempPassword).then(() => toast.success("Copied."))
                      }
                      className={`${buttonClass.secondary} flex items-center gap-1`}
                    >
                      <HiOutlineClipboardDocument /> Copy
                    </button>
                  </div>
                </div>
              )}
              <div className={`${cardClass} overflow-x-auto`}>
                <table className="w-full min-w-[40rem] table-auto">
                  <thead>
                    <tr>
                      <th className={thClass}>User</th>
                      <th className={thClass}>Role</th>
                      <th className={thClass}>Last sign-in</th>
                      <th className={thClass}>Status</th>
                      <th className={thClass} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                    {detail.users.map((u) => (
                      <tr key={u.id} className={u.is_active ? "" : "opacity-60"}>
                        <td className={tdClass}>
                          <p className="font-medium text-gray-800 dark:text-gray-100">{u.display_name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{u.username}</p>
                        </td>
                        <td className={`${tdClass} capitalize`}>{u.role}</td>
                        <td className={tdClass} title={formatDateTime(u.last_login_at)}>
                          {timeAgo(u.last_login_at)}
                        </td>
                        <td className={tdClass}>{u.is_active ? "Active" : "Deactivated"}</td>
                        <td className={`${tdClass} whitespace-nowrap text-right`}>
                          <button
                            type="button"
                            disabled={busy === `reset-${u.id}` || !u.is_active}
                            onClick={() => resetPassword(u)}
                            className={`${buttonClass.secondary} mr-2`}
                          >
                            Reset password
                          </button>
                          <button
                            type="button"
                            disabled={busy === `user-${u.id}`}
                            onClick={() => toggleUser(u)}
                            className={u.is_active ? buttonClass.danger : buttonClass.secondary}
                          >
                            {u.is_active ? "Deactivate" : "Reactivate"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "billing" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {sub.status === "untracked"
                  ? "No payments recorded — this shop isn't billed through the console yet. Record its first payment or free trial below."
                  : sub.daysLeft < 0
                    ? `Overdue by ${-sub.daysLeft} day(s) — was due ${formatDay(sub.dueOn)}.`
                    : `Paid up to ${formatDay(sub.dueOn)} (${sub.daysLeft} day(s) left). The owner sees a reminder from 7 days before.`}{" "}
                Nothing is switched off automatically when a payment is late.
              </p>

              <form onSubmit={recordPayment} className={`${cardClass} grid grid-cols-3 gap-3 p-4 sm:grid-cols-1`}>
                <div>
                  <label className={labelClass}>Method</label>
                  <select className={inputClass} {...paymentField("method")}>
                    {PAYMENT_METHODS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Amount (PKR)</label>
                  <input
                    type="number"
                    min={FREE_METHODS.includes(payment.method) ? 0 : 1}
                    step={1}
                    required={!FREE_METHODS.includes(payment.method)}
                    disabled={FREE_METHODS.includes(payment.method)}
                    className={inputClass}
                    {...paymentField("amount")}
                    value={FREE_METHODS.includes(payment.method) ? 0 : payment.amount}
                  />
                </div>
                <div>
                  <label className={labelClass}>Months covered</label>
                  <input type="number" min={1} max={36} step={1} required className={inputClass} {...paymentField("months")} />
                </div>
                <div>
                  <label className={labelClass}>Starting</label>
                  <input type="date" className={inputClass} {...paymentField("coversFrom")} />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Blank = where the current period ends (or today)
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Reference</label>
                  <input
                    type="text"
                    maxLength={80}
                    className={inputClass}
                    placeholder="Transaction ID / receipt no."
                    {...paymentField("reference")}
                  />
                </div>
                <div>
                  <label className={labelClass}>Note</label>
                  <input type="text" maxLength={200} className={inputClass} {...paymentField("note")} />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <button type="submit" disabled={busy === "payment"} className={buttonClass.primary}>
                    {busy === "payment" ? "Saving…" : "Record payment"}
                  </button>
                </div>
              </form>

              <div className={`${cardClass} overflow-x-auto`}>
                {sub.payments.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">No payments yet.</p>
                ) : (
                  <table className="w-full min-w-[40rem] table-auto">
                    <thead>
                      <tr>
                        <th className={thClass}>Period</th>
                        <th className={thClass}>Method</th>
                        <th className={`${thClass} text-right`}>Amount</th>
                        <th className={thClass}>Reference</th>
                        <th className={thClass}>Recorded</th>
                        <th className={thClass} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border dark:divide-gray-700">
                      {sub.payments.map((p) => (
                        <tr key={p.id}>
                          <td className={`${tdClass} whitespace-nowrap`}>
                            {formatDay(p.covers_from)} – {formatDay(p.covers_until)}
                          </td>
                          <td className={tdClass}>{METHOD_LABEL[p.method]}</td>
                          <td className={`${tdClass} whitespace-nowrap text-right font-semibold`}>{formatPKR(p.amount)}</td>
                          <td className={`${tdClass} text-xs`}>
                            {p.reference || "—"}
                            {p.note && <p className="text-gray-500 dark:text-gray-400">{p.note}</p>}
                          </td>
                          <td className={`${tdClass} text-xs text-gray-500 dark:text-gray-400`}>
                            {formatDateTime(p.created_at)}
                            {p.recorded_by_name && ` · ${p.recorded_by_name}`}
                          </td>
                          <td className={`${tdClass} text-right`}>
                            <button
                              type="button"
                              disabled={busy === `payment-${p.id}`}
                              onClick={() => deletePayment(p)}
                              aria-label="Delete payment"
                              title="Delete (for a mistaken entry)"
                              className={buttonClass.danger}
                            >
                              <HiOutlineTrash />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {tab === "activity" && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
              <div className={cardClass}>
                <div className="flex items-center justify-between border-b border-surface-border px-4 py-2.5 dark:border-gray-700">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Recent sign-ins</h3>
                  <Link
                    to={`/admin/activity?tab=logins&shopId=${shop.id}`}
                    className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    All
                  </Link>
                </div>
                {detail.recentLogins.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">None recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-surface-border text-sm dark:divide-gray-700">
                    {detail.recentLogins.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 px-4 py-2">
                        <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">
                          {e.username}{" "}
                          <span
                            className={
                              e.outcome === "success"
                                ? "text-success-600"
                                : e.outcome === "locked"
                                  ? "text-danger-600"
                                  : "text-amber-600"
                            }
                          >
                            {e.outcome === "success"
                              ? "signed in"
                              : e.outcome === "locked"
                                ? "refused (locked)"
                                : "wrong password"}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400" title={formatDateTime(e.created_at)}>
                          {timeAgo(e.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={cardClass}>
                <div className="flex items-center justify-between border-b border-surface-border px-4 py-2.5 dark:border-gray-700">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Admin changes</h3>
                  <Link
                    to={`/admin/activity?tab=audit&shopId=${shop.id}`}
                    className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    All
                  </Link>
                </div>
                {detail.recentAudit.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No changes recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-surface-border text-sm dark:divide-gray-700">
                    {detail.recentAudit.map((a) => (
                      <li key={a.id} className="px-4 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-800 dark:text-gray-100">
                            {AUDIT_ACTION_LABEL[a.action] || a.action}
                          </span>
                          <span
                            className="shrink-0 text-xs text-gray-500 dark:text-gray-400"
                            title={formatDateTime(a.created_at)}
                          >
                            {timeAgo(a.created_at)}
                          </span>
                        </div>
                        {auditDetails(a.details) && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{auditDetails(a.details)}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
