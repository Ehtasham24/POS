// Orchestrates: when connectivity is confirmed, replay any queued offline sales against the
// real backend in order, then refresh the local read-mirror so it's never far from live.
import { apiPost } from "utils/api";
import * as connectivity from "./connectivity";
import * as outbox from "./outbox";
import { refreshFromServer } from "./cache";

const state = { syncing: false, pendingCount: 0 };
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn({ ...state }));

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const getState = () => ({ ...state });

const refreshPendingCount = async () => {
  state.pendingCount = await outbox.pendingCount();
  notify();
};

const flush = async () => {
  if (state.syncing) return;
  state.syncing = true;
  notify();

  try {
    const pending = await outbox.listPending();
    for (const { id, payload } of pending) {
      // Stop at the first failure (e.g. connectivity dropped again mid-flush) rather than
      // reordering sales by skipping ahead — the rest stay queued for the next reconnect.
      await apiPost("/sales", payload);
      await outbox.removeSynced(id);
    }
    await refreshFromServer();
  } catch (error) {
    console.warn("Offline sync flush stopped early:", error);
    if (error.isAuthError) {
      // A dropped/expired session (not a dead network — connectivity.js already confirmed
      // the server itself is reachable, via /api/health, before this ever ran) would
      // otherwise fail silently here forever, since this runs with no user interaction at
      // all (triggered purely by a connectivity subscription). This is a distinct signal
      // from the generic "you're logged out, go to /login" handling in AuthContext.jsx —
      // specifically calling out that queued sales are stuck because of it. Plain
      // window event, not a direct toast call, since this module has no React/hook
      // access — a listener in AuthContext.jsx (already mounted app-wide) picks it up.
      const stillPending = await outbox.pendingCount();
      window.dispatchEvent(new CustomEvent("sync:auth-error", { detail: { pendingCount: stillPending } }));
    }
  } finally {
    state.syncing = false;
    await refreshPendingCount();
  }
};

let started = false;
export const start = () => {
  if (started) return;
  started = true;

  connectivity.subscribe((online) => {
    if (online) flush();
  });
  connectivity.start();

  refreshPendingCount();
  if (connectivity.isOnline()) flush();
};

export const enqueueOfflineSale = async (payload) => {
  await outbox.enqueueSale(payload);
  await refreshPendingCount();
};
