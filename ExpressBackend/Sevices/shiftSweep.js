const { autoCloseIdleShifts } = require("./shiftService");

// Checked every 2 minutes — frequent enough that an abandoned shift is never left "open"
// much longer than shiftService.js's own IDLE_MINUTES threshold, without hammering the DB
// (the query it runs is a cheap, indexed scan over the small set of currently-open shifts —
// see migrations/019's idx_shifts_open_last_activity).
const SWEEP_INTERVAL_MS = 2 * 60 * 1000;

// Called once at server startup (Server.js). A plain setInterval is enough here — this app
// runs as one persistent long-lived Node process (not serverless/multi-instance), so there's
// no risk of two processes double-sweeping the same shift; autoCloseOneShift's FOR UPDATE
// lock inside shiftService.js would make that safe anyway.
const startShiftAutoCloseSweep = () => {
  setInterval(async () => {
    try {
      const closedCount = await autoCloseIdleShifts();
      if (closedCount > 0) {
        console.log(`Shift auto-close sweep: closed ${closedCount} idle shift(s)`);
      }
    } catch (err) {
      console.error("Shift auto-close sweep failed:", err);
    }
  }, SWEEP_INTERVAL_MS);
};

module.exports = { startShiftAutoCloseSweep };
