// Sales made while offline — queued here, replayed against the real API on reconnect
// (see syncManager.js).
import { query, run } from "./db";

export const enqueueSale = (payload) =>
  run("INSERT INTO pending_sales (payload) VALUES (?)", [JSON.stringify(payload)]);

export const listPending = async () => {
  const rows = await query("SELECT id, payload FROM pending_sales ORDER BY id");
  return rows.map((row) => ({ id: row.id, payload: JSON.parse(row.payload) }));
};

export const removeSynced = (id) => run("DELETE FROM pending_sales WHERE id = ?", [id]);

export const pendingCount = async () => {
  const rows = await query("SELECT COUNT(*) AS count FROM pending_sales");
  return rows[0]?.count || 0;
};
