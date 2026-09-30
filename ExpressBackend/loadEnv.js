const path = require("path");

// Loads Development.env into process.env, overriding anything already set — except on a shop's
// own device (../device/), which declares POS_RUNTIME=device and supplies its own environment.
// That file points DATABASE_URL at the cloud database, so letting it load there would quietly
// send a device's local writes to the shared cloud database instead of its own.
if (process.env.POS_RUNTIME !== "device") {
  require("dotenv").config({ override: true, path: path.join(__dirname, "Development.env") });
}
