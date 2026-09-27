const { purgeOldLoginEvents } = require("./loginSecurityService");
const { trackJob } = require("./monitoringService");

// Once a day: housekeeping that keeps platform tables from growing forever. Runs a minute
// after startup too, so a server that restarts daily still gets it done.
const DAY_MS = 24 * 60 * 60 * 1000;

const runMaintenance = async () => {
  try {
    await trackJob("Old sign-in history cleanup", async () => {
      const deleted = await purgeOldLoginEvents();
      return { deleted };
    });
  } catch (err) {
    console.error("Maintenance sweep failed:", err);
  }
};

const startMaintenanceSweep = () => {
  setTimeout(runMaintenance, 60 * 1000).unref();
  setInterval(runMaintenance, DAY_MS).unref();
};

module.exports = { startMaintenanceSweep };
