-- Offline registers, phase 3: devices pull the change feed by transaction-id window (see
-- Sevices/syncService.js's pullChanges), so the feed is read by (shop_id, xid).
--
-- Safe to re-run.
CREATE INDEX IF NOT EXISTS idx_sync_changes_shop_xid ON sync_changes (shop_id, xid, id);
