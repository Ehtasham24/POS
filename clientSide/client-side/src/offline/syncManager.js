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
