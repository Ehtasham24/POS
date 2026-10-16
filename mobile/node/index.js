// The register's backend on Android, run by nodejs-mobile (capacitor-nodejs) when the app opens:
// the same device runtime as the Windows app (../../device/runtime.js), against a database kept
// in the app's private storage. www/index.html waits for it, then opens the POS from it. On the
// first start the POS shows its setup page: the shop owner signs in with the account the
// platform admin created, and the phone registers with the cloud and downloads the shop.
//
// scripts/bundle-node.js copies this file to www/nodejs/index.js, next to device/,
// ExpressBackend/ and the React build laid out as they are in the repository, and writes
// release.json beside it: this build's version, its shell (native) level, the cloud it belongs
// to and where its updates come from.
//
// Updates (device/updater.js): this file always comes from the installed app, never from an
// update, and decides which code runs — the code built into the app, or a newer downloaded
// version. A newly downloaded version runs on trial: it's kept once it has started properly, and
// dropped (back to the previous one) if it fails to start twice.
const fs = require("fs");
const path = require("path");
const { channel, getDataPath } = require("bridge");

const PORT = 4100;
// Only updates signed with the matching private key (kept outside the repository, used by
// .github/workflows/release.yml) are ever run.
const UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAw+aBUXbSuW7B8Gzc1n/+QO+cJ+efD+envXoXuFDILeY=
-----END PUBLIC KEY-----`;
const UPDATES = path.join(getDataPath(), "updates");
const BOOT_FILE = path.join(UPDATES, "boot.json");
const PENDING_FILE = path.join(UPDATES, "pending.json");
const MAX_TRIAL_STARTS = 2;
// A trial version that has run this long after starting is kept.
const KEEP_AFTER_MS = 20 * 1000;

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value));
  fs.renameSync(`${file}.tmp`, file);
};

const installed = readJson(path.join(__dirname, "release.json"), {});

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

// Which code runs: a downloaded version when it's newer than the app's own, runs on this app's
// shell level, and hasn't failed; otherwise the app's own.
const { compareVersions } = require("./device/updater");
const chooseCode = () => {
  const boot = { good: null, trial: null, trialStarts: 0, bad: [], ...readJson(BOOT_FILE, {}) };
  const bundleDir = (version) => path.join(UPDATES, "bundles", version);
  const usable = (version) => {
    if (!version || boot.bad.includes(version) || compareVersions(version, installed.version) <= 0) return false;
    const bundled = readJson(path.join(bundleDir(version), "release.json"), null);
    return bundled?.version === version && bundled.shell <= installed.shell && fs.existsSync(path.join(bundleDir(version), "device", "runtime.js"));
  };

  const pending = readJson(PENDING_FILE, null)?.version;
  if (pending) {
    fs.rmSync(PENDING_FILE, { force: true });
    if (usable(pending) && pending !== boot.trial) Object.assign(boot, { trial: pending, trialStarts: 0 });
  }
  if (boot.trial) {
    if (!usable(boot.trial) || boot.trialStarts >= MAX_TRIAL_STARTS) {
      report(`Update ${boot.trial} didn't start properly — back to the previous version`);
      boot.bad.push(boot.trial);
      Object.assign(boot, { trial: null, trialStarts: 0 });
    } else boot.trialStarts += 1;
  }
  const version = boot.trial || (usable(boot.good) ? boot.good : null);
  if (fs.existsSync(UPDATES)) writeJson(BOOT_FILE, boot);
  return { boot, version: version || installed.version, dir: version ? bundleDir(version) : __dirname, trial: Boolean(boot.trial) };
};

// After a trial version has proven itself: keep it, and remove versions no longer needed.
const keepTrial = (boot, version) => {
  Object.assign(boot, { good: version, trial: null, trialStarts: 0 });
  writeJson(BOOT_FILE, boot);
  pruneBundles(boot);
};
const pruneBundles = (boot) => {
  const bundles = path.join(UPDATES, "bundles");
  if (!fs.existsSync(bundles)) return;
  for (const name of fs.readdirSync(bundles)) {
    if (name !== boot.good && name !== boot.trial) fs.rmSync(path.join(bundles, name), { recursive: true, force: true });
  }
};

// The phase-0 prototype kept a made-up local shop in "pos"; a real register starts clean in
// "register" and is set up from the cloud.
fs.rmSync(path.join(getDataPath(), "pos"), { recursive: true, force: true });

const code = chooseCode();
if (!code.trial) pruneBundles(code.boot);
if (installed.cloudUrl) process.env.POS_CLOUD_URL = installed.cloudUrl;
process.env.POS_APP_VERSION = code.version;
// Read by device/runtime.js, which runs the updater with it.
global.posUpdater = installed.updateFeed
  ? { updatesDir: UPDATES, feedUrl: installed.updateFeed, publicKey: UPDATE_PUBLIC_KEY, version: code.version, shell: installed.shell }
  : null;
console.log(`[pos] ${JSON.stringify({ node: process.versions.node, installed, running: code.version, trial: code.trial })}`);

const started = Date.now();
require(path.join(code.dir, "device", "runtime"))
  .startDevice({ dataDir: path.join(getDataPath(), "register"), port: PORT })
  .then(() => {
    console.log(`[pos] backend up in ${Date.now() - started}ms on port ${PORT} (v${code.version})`);
    if (code.trial) setTimeout(() => keepTrial(code.boot, code.version), KEEP_AFTER_MS);
  })
  .catch((err) => report(`Start failed: ${err.stack || err}`));
