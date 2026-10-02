// Starts the POS on a shop's own device: the local database, then the existing Express backend
// on top of it, in this process (see ../plan-offline-sync.md). Used by index.js (command line)
// and electron/main.js (the Windows app).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { openLocalDb } = require("./localDb");
const { createPglitePool } = require("./pglitePool");
const { deviceRoutes } = require("./deviceRoutes");
const { createSyncWorker } = require("./syncWorker");

// Where the shop's cloud server is. The setup page shows it and lets it be changed.
const DEFAULT_CLOUD_URL = process.env.POS_CLOUD_URL || "https://localhost:4000";

// Per-device settings that must survive restarts: the secret this device signs its own login
// sessions with (never the cloud's JWT_SECRET, which must not leave the cloud), and once it's
// set up, its registration — id, token, receipt prefix, cloud address — and sync position.
// Written to a temporary file and renamed over the old one, so a power cut mid-write leaves
// either the old settings or the new, never half a file.
const configFile = (dataDir) => path.join(dataDir, "device.json");

// The secrets in it (the device's cloud token, its session-signing key) are encrypted with the
// operating system's protection for this Windows user (Electron safeStorage, DPAPI) when the app
// runs under Electron, so copying the file to another machine or account doesn't copy them.
// Run from the command line (tests, development) they're stored as they are.
const SECRET_FIELDS = ["deviceToken", "jwtSecret"];
// Looked up on first use, not when this file loads: Electron only offers encryption once the app
// is ready, and electron/main.js loads this file before that.
let storageChecked = false;
let protectedStorage = null;
const safeStorage = () => {
  if (!storageChecked && process.versions.electron) {
    const { safeStorage: storage } = require("electron");
    protectedStorage = storage.isEncryptionAvailable() ? storage : null;
  }
  storageChecked = true;
  return protectedStorage;
};
const toFile = (config) => {
  if (!safeStorage()) return config;
  const stored = { ...config, protected: {} };
  for (const field of SECRET_FIELDS) {
    if (stored[field] == null) continue;
    stored.protected[field] = safeStorage().encryptString(stored[field]).toString("base64");
    delete stored[field];
  }
  return stored;
};
const fromFile = (stored) => {
  const { protected: secrets = {}, ...config } = stored;
  for (const [field, value] of Object.entries(secrets)) {
    if (!safeStorage()) throw new Error(`device.json holds protected ${field}, but this machine can't decrypt it`);
    config[field] = safeStorage().decryptString(Buffer.from(value, "base64"));
  }
  return config;
};

const saveDeviceConfig = (dataDir, config) => {
  const file = configFile(dataDir);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(toFile(config), null, 2));
  fs.renameSync(`${file}.tmp`, file);
};
const deviceConfig = (dataDir) => {
  const file = configFile(dataDir);
  if (fs.existsSync(file)) return fromFile(JSON.parse(fs.readFileSync(file, "utf8")));
  // receiptPrefix stays "D1" until the device is registered with the cloud, which assigns one.
  const config = { jwtSecret: crypto.randomBytes(48).toString("hex"), receiptPrefix: "D1", createdAt: new Date().toISOString() };
  fs.mkdirSync(dataDir, { recursive: true });
  saveDeviceConfig(dataDir, config);
  return config;
};

// devShop "name:owner_username:owner_password" creates a shop in an empty database — a stand-in
// for the first-run download from the cloud (phase 2), for local testing only.
const createDevShop = async (devShop) => {
  const [name, ownerUsername, ownerPassword] = devShop.split(":");
  const { systemPool } = require("../ExpressBackend/Db");
  const { rows } = await systemPool.query(`SELECT COUNT(*)::int AS n FROM shops`);
  if (rows[0].n > 0) return;
  const { createShop } = require("../ExpressBackend/Sevices/adminService");
  await createShop({ name, tier: "advanced", ownerUsername, ownerPassword, maxUsers: 20 });
  console.log(`Created local shop "${name}"`);
};

// Trust the certificates Windows trusts (its certificate store), not only the list Node ships
// with: the cloud's certificate may come from a company's or a development CA installed there.
const trustSystemCertificates = () => {
  const tls = require("tls");
  if (typeof tls.setDefaultCACertificates !== "function") return;
  tls.setDefaultCACertificates([...new Set([...tls.getCACertificates("default"), ...tls.getCACertificates("system")])]);
};

// Resolves once the database is open and the backend is loading; the backend logs
// "Server started at Port N" when it is listening. Call once per process.
const startDevice = async ({ dataDir, port = 4100, devShop }) => {
  const started = Date.now();
  trustSystemCertificates();
  const config = deviceConfig(dataDir);
  const db = await openLocalDb(path.join(dataDir, "pgdata"), { receiptPrefix: config.receiptPrefix || "D1" });
  console.log(`Local database ready in ${Date.now() - started}ms`);

  Object.assign(process.env, {
    POS_RUNTIME: "device",
    DB_TENANT_RLS: "off", // one shop per device database; see plan-offline-sync.md
    JWT_SECRET: config.jwtSecret,
    PORT: String(port),
    APP_HTTPS: "false",
  });
  const saveConfig = (next) => saveDeviceConfig(dataDir, next);
  let syncWorker = null;
  global.posDevice = {
    createPool: (driver) => createPglitePool(db, driver),
    routes: deviceRoutes({ db, config, saveConfig, defaultCloudUrl: DEFAULT_CLOUD_URL, sync: () => syncWorker }),
  };

  if (devShop) await createDevShop(devShop);
  require("../ExpressBackend/Server");

  // Through the backend's own pool, so its transactions queue with the requests' (pglitePool.js).
  // It idles until the device is registered and set up.
  syncWorker = createSyncWorker({ db: require("../ExpressBackend/Db").systemPool, config, saveConfig });
  syncWorker.start();

  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      await syncWorker.stop();
      await db.close();
    },
  };
};

module.exports = { startDevice };
