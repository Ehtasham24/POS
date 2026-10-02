const { purgeOldLoginEvents } = require("./loginSecurityService");
const { trackJob } = require("./monitoringService");
const { purgeOldSyncHistory } = require("./deviceService");

// Once a day: housekeeping that keeps platform tables from growing forever. Runs a minute
// after startup too, so a server that restarts daily still gets it done.
const DAY_MS = 24 * 60 * 60 * 1000;

const runMaintenance = async () => {
  try {
    await trackJob("Old sign-in history cleanup", async () => {
      const deleted = await purgeOldLoginEvents();
      return { deleted };
    });
    // The change feed and sync log are the cloud's; a shop's own device has neither.
    if (process.env.POS_RUNTIME !== "device") {
      await trackJob("Old sync history cleanup", purgeOldSyncHistory);
    }
  } catch (err) {
    console.error("Maintenance sweep failed:", err);
  }
};

const startMaintenanceSweep = () => {
  setTimeout(runMaintenance, 60 * 1000).unref();
  setInterval(runMaintenance, DAY_MS).unref();
};

module.exports = { startMaintenanceSweep };
