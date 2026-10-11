import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineLink, HiOutlineLockClosed } from "react-icons/hi2";
import { TicketStatusBadge } from "components/Support";
import useDebounce from "hooks/useDebounce";
import { apiGet } from "utils/api";
import { cardClass, inputClass, buttonClass } from "./shared";
import { PRIORITIES, PRIORITY_LABEL } from "./Tickets";

const headingClass = "mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-800 dark:text-gray-100";

// The admin's own triage of a ticket (Sevices/supportService.js adminUpdateTicket): its priority
// and a private note. Neither is ever shown to the shop. `onUpdate(changes)` saves and shows.
export function TriageCard({ ticket, onUpdate }) {
  const [note, setNote] = useState(ticket.admin_note || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setNote(ticket.admin_note || ""), [ticket.admin_note]);

  const save = async (changes) => {
    setSaving(true);
    try {
      await onUpdate(changes);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${cardClass} p-4`}>
      <h2 className={headingClass}>
        <HiOutlineLockClosed /> Triage <span className="font-normal text-gray-500 dark:text-gray-400">· only you see this</span>
      </h2>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
        Priority
        <select value={ticket.priority} onChange={(e) => save({ priority: e.target.value })} disabled={saving} className={inputClass} aria-label="Priority">
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-xs font-semibold text-gray-600 dark:text-gray-300">
        Note
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="e.g. Looks like the printer driver; check on v1.3"
          className={inputClass}
          aria-label="Admin note"
        />
      </label>
      <button
        type="button"
        onClick={() => save({ adminNote: note })}
        disabled={saving || note.trim() === (ticket.admin_note || "")}
        className={`${buttonClass.secondary} mt-2 w-full`}
      >
        Save note
      </button>
    </div>
  );
}

const LinkedTicket = ({ ticket }) => (
  <Link
    to={`/admin/tickets/${ticket.id}`}
    className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-subtle dark:hover:bg-gray-700/60"
  >
    <span className="min-w-0 text-sm">
      <span className="block truncate font-medium text-gray-800 dark:text-gray-100">
        #{ticket.id} {ticket.title}
      </span>
      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{ticket.shop_name}</span>
    </span>
    <TicketStatusBadge status={ticket.status} />
  </Link>
);

// The same problem reported more than once. A duplicate shows the ticket it follows (and can be
// unlinked); a main ticket lists its duplicates and how many shops they come from. Either can be
// marked as a duplicate of another ticket, found by title, shop or number.
export function DuplicatesCard({ ticket, onUpdate }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const q = useDebounce(search.trim(), 300);

  useEffect(() => {
    setResults(null);
    if (!q) return undefined;
    let alive = true;
    apiGet(`/api/admin/support/tickets?${new URLSearchParams({ state: "all", hideDuplicates: "1", q })}`)
      .then((data) => alive && setResults(data.tickets.filter((t) => String(t.id) !== String(ticket.id)).slice(0, 5)))
      .catch(() => alive && setResults([]));
    return () => {
      alive = false;
    };
  }, [q, ticket.id]);

  const link = async (duplicateOf) => {
    setSaving(true);
    try {
      await onUpdate({ duplicateOf });
      setSearch("");
    } finally {
      setSaving(false);
    }
  };

  if (ticket.main_ticket) {
    return (
      <div className={`${cardClass} p-4`}>
        <h2 className={headingClass}>
          <HiOutlineLink /> Duplicate of
        </h2>
        <LinkedTicket ticket={ticket.main_ticket} />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">This ticket follows that one's status — the shop sees it move along with it.</p>
        <button type="button" onClick={() => link(null)} disabled={saving} className={`${buttonClass.secondary} mt-3 w-full`}>
          Unlink
        </button>
      </div>
    );
  }

  return (
    <div className={`${cardClass} p-4`}>
      <h2 className={headingClass}>
        <HiOutlineLink /> Same problem
      </h2>
      {ticket.duplicates.length > 0 && (
        <>
          <p className="mb-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
            Reported {ticket.duplicates.length + 1} times by {ticket.shops_affected} shop{ticket.shops_affected === 1 ? "" : "s"}. Its status moves all of them.
          </p>
          <div className="mb-3 flex flex-col">
            {ticket.duplicates.map((d) => (
              <LinkedTicket key={d.id} ticket={d} />
            ))}
          </div>
        </>
      )}
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
        Mark as a duplicate of…
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Title, shop or #number"
          className={inputClass}
          aria-label="Find the main ticket"
        />
      </label>
      {results && (
        <ul className="mt-2 flex flex-col gap-1">
          {results.length === 0 && <li className="px-2 text-xs text-gray-500 dark:text-gray-400">No other ticket matches.</li>}
          {results.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-surface-border px-2 py-1.5 dark:border-gray-700">
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium text-gray-800 dark:text-gray-100">
                  #{r.id} {r.title}
                </span>
                <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{r.shop_name}</span>
              </span>
              <button
                type="button"
                onClick={() => link(r.id)}
                disabled={saving}
                className="shrink-0 rounded-lg bg-primary-600 px-3 py-1 text-xs font-semibold text-white-A700 hover:bg-primary-700 disabled:opacity-50"
              >
                Link
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
