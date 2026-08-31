import { useEffect, useRef, useState } from "react";
import { HiOutlineKey } from "react-icons/hi2";
import { apiGet, apiPatch } from "utils/api";
import { useToast } from "components/Toast/ToastContext";

const POLL_MS = 60000;

// Forgot-password requests, reviewed here — mirrors LowStockBell.jsx's dropdown shape
// (same POLL_MS, same click-outside-to-close), but only ever renders once there's
// something to act on (StorageWarningBadge.jsx's "invisible until it matters, then glows"
// pattern) since a locked-out owner is time-sensitive in a way a standing stock count
// isn't. Approve/Reject happen inline in the dropdown, not on a separate page — approving
// replaces that row with the one-time temp password instead of navigating away, since
// it's only ever shown here, once (passwordResetService.js never stores the plaintext).
export default function PasswordResetRequestsBadge() {
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [open, setOpen] = useState(false);
  const [approvedResults, setApprovedResults] = useState({}); // requestId -> { tempPassword, ... }
  const [busyId, setBusyId] = useState(null);
  const containerRef = useRef(null);

  const fetchRequests = async () => {
    try {
      setRequests(await apiGet("/api/admin/password-reset-requests?status=pending"));
    } catch (error) {
      console.error("Error fetching password reset requests:", error);
    }
  };

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleApprove = async (request) => {
    setBusyId(request.id);
    try {
      const result = await apiPatch(`/api/admin/password-reset-requests/${request.id}/approve`);
      setApprovedResults((prev) => ({ ...prev, [request.id]: result }));
      // Removed from the pending list on the NEXT poll (or reopen) — kept visible for now
      // (with its approved result) so the admin can still see/copy the temp password.
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (request) => {
    const notes = window.prompt("Reason for rejecting this request (optional):") || "";
    setBusyId(request.id);
    try {
      await apiPatch(`/api/admin/password-reset-requests/${request.id}/reject`, { notes });
      toast.success(`Rejected ${request.displayName}'s request.`);
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard.");
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the password is still
      // visible on screen to copy by hand, so this isn't a dead end either way.
      toast.error("Couldn't copy automatically — select and copy the password manually.");
    }
  };

  if (requests.length === 0) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Password reset requests"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 animate-ping rounded-full bg-danger-500 opacity-75" />
        <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-danger-600 ring-2 ring-white-A700 dark:ring-gray-800" />
        <HiOutlineKey className="text-lg" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-96 max-w-[92vw] overflow-hidden rounded-xl border border-surface-border bg-white-A700 shadow-modal dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-surface-border px-4 py-3 font-poppins font-bold text-gray-800 dark:border-gray-700 dark:text-gray-100">
            Password Reset Requests
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {requests.map((r) => {
              const approved = approvedResults[r.id];
              const hasNoProfile = !r.onFileCnic && !r.onFilePhone;
              return (
                <li key={r.id} className="border-b border-surface-border px-4 py-3 last:border-b-0 dark:border-gray-700">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold text-gray-800 dark:text-gray-100">{r.displayName}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{r.shopName}</span>
                  </div>
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">@{r.username}</p>

                  {hasNoProfile ? (
                    <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                      ⚠ Nothing on file for this owner yet — verify identity manually before approving.
                    </p>
                  ) : (
                    <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div>
                        <p className="text-gray-400 dark:text-gray-500">Claimed</p>
                        <p className="text-gray-700 dark:text-gray-200">{r.claimedCnic || r.claimedPhone || "—"}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 dark:text-gray-500">On file</p>
                        <p className="text-gray-700 dark:text-gray-200">{r.onFileCnic || r.onFilePhone || "—"}</p>
                      </div>
                    </div>
                  )}

                  {approved ? (
                    <div className="rounded-lg bg-success-50 px-2.5 py-2 dark:bg-success-500/10">
                      <p className="text-xs text-success-700 dark:text-success-500">
                        Approved — share this temp password now, it won't be shown again:
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <code className="flex-1 rounded bg-white-A700 px-2 py-1 text-sm font-bold tracking-wide text-gray-800 dark:bg-gray-900 dark:text-gray-100">
                          {approved.tempPassword}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(approved.tempPassword)}
                          className="rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-medium text-white-A700 hover:bg-primary-700"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => handleApprove(r)}
                        className="flex-1 rounded-lg bg-primary-600 py-1.5 text-xs font-semibold text-white-A700 transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => handleReject(r)}
                        className="flex-1 rounded-lg border border-surface-border py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
