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
const saveDeviceConfig = (dataDir, config) => {
  const file = configFile(dataDir);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(config, null, 2));
  fs.renameSync(`${file}.tmp`, file);
};
const deviceConfig = (dataDir) => {
  const file = configFile(dataDir);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
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

// Resolves once the database is open and the backend is loading; the backend logs
// "Server started at Port N" when it is listening. Call once per process.
const startDevice = async ({ dataDir, port = 4100, devShop }) => {
  const started = Date.now();
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
