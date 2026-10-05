// The register's backend on Android, run by nodejs-mobile (capacitor-nodejs) when the app opens:
// the same device runtime as the Windows app (../../device/runtime.js), against a database kept
// in the app's private storage. www/index.html waits for it, then opens the POS from it.
//
// scripts/bundle-node.js copies this file to www/nodejs/index.js, next to device/,
// ExpressBackend/ and the React build laid out as they are in the repository.
const fs = require("fs");
const path = require("path");
const { channel, getDataPath } = require("bridge");

const PORT = 4100;

// Startup problems go to the loading page as well as the log (adb logcat), since a phone has no
// console to look at.
const report = (message) => {
  console.error(message);
  try {
    channel.send("startup-error", message);
  } catch {}
};
process.on("uncaughtException", (err) => report(`Uncaught: ${err.stack || err}`));
process.on("unhandledRejection", (err) => report(`Unhandled: ${err?.stack || err}`));

// What this phone's Node can do, for the prototype's go/no-go (plan-offline-sync.md, phase 0).
const diagnostics = () => {
  const out = { node: process.versions.node, mobile: process.versions.mobile, platform: process.platform, arch: process.arch };
  try {
    out.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    out.timeZones = Intl.supportedValuesOf("timeZone").length;
    out.karachiOffset = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", timeZoneName: "shortOffset" }).format(new Date());
  } catch (err) {
    out.intlError = err.message;
  }
  return out;
};
console.log(`[pos] ${JSON.stringify(diagnostics())}`);

// scripts/bundle-node.js ships *.gz files as *.gz.keep (Android's build would unpack them);
// put their names back. Only after an install or update — afterwards there are none left.
const restoreGzFiles = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) restoreGzFiles(full);
    else if (entry.name.endsWith(".gz.keep")) fs.renameSync(full, full.slice(0, -".keep".length));
  }
};
restoreGzFiles(path.join(__dirname, "device", "node_modules"));

const started = Date.now();
require("./device/runtime")
  .startDevice({
    dataDir: path.join(getDataPath(), "pos"),
    port: PORT,
    // Prototype only: a local shop so the register works without the cloud (phase 0).
    devShop: "Mobile Test Shop:m_owner:M-Owner-123",
  })
  .then(() => console.log(`[pos] backend up in ${Date.now() - started}ms on port ${PORT}`))
  .catch((err) => report(`Start failed: ${err.stack || err}`));
