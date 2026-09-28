const { autoCloseIdleShifts } = require("./shiftService");
const { trackJob } = require("./monitoringService");

// Checked hourly — the threshold it enforces is days (shiftService.js's ABANDONED_AFTER_DAYS),
// so there's nothing to gain from looking more often. The query is a cheap, indexed scan over
// the small set of currently-open shifts (migrations/019's idx_shifts_open_last_activity).
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

// Called once at server startup (Server.js). A plain setInterval is enough here — this app
// runs as one persistent long-lived Node process (not serverless/multi-instance), so there's
// no risk of two processes double-sweeping the same shift; autoCloseOneShift's FOR UPDATE
// lock inside shiftService.js would make that safe anyway.
const startShiftAutoCloseSweep = () => {
  setInterval(async () => {
    try {
      // trackJob: last run / last error for the admin console's Health page.
      const closedCount = await trackJob("Shift auto-close", autoCloseIdleShifts);
      if (closedCount > 0) {
        console.log(`Shift auto-close sweep: closed ${closedCount} idle shift(s)`);
      }
    } catch (err) {
      console.error("Shift auto-close sweep failed:", err);
    }
  }, SWEEP_INTERVAL_MS);
};

module.exports = { startShiftAutoCloseSweep };
