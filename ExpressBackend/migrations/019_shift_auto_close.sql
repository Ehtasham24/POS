-- Auto-closes an abandoned shift (crashed app, closed browser/tab, forgotten to close) after
-- 15 minutes of inactivity, instead of leaving it open forever — which would otherwise block
-- that user from ever opening a new shift again (migrations/017's one-open-shift-per-user
-- constraint) and would leave its sales permanently un-reconciled. See plan discussion for
-- the full design: nobody physically counted the drawer when this happens, so counted_cash/
-- variance are deliberately left NULL (not assumed to match expected_cash) — auto_closed
-- flags it for a human to reconcile properly later via Sevices/shiftService.js's
-- reconcileShift, whenever someone next gets to the actual drawer.
-- Safe to re-run: guarded with IF NOT EXISTS throughout.

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN NOT NULL DEFAULT false;

-- What the periodic sweep (Sevices/shiftSweep.js) scans on — cheap even run every couple
-- of minutes, since it's a small, mostly-empty set of currently-open shifts.
CREATE INDEX IF NOT EXISTS idx_shifts_open_last_activity ON shifts(last_activity_at) WHERE status = 'open';
