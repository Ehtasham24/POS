// Starts the POS on a shop's own device: the local database, then the existing Express backend
// on top of it, in this process (see ../plan-offline-sync.md). Used by index.js (command line)
// and electron/main.js (the Windows app).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { openLocalDb } = require("./localDb");
const { createPglitePool } = require("./pglitePool");

// Per-device settings that must survive restarts: the secret this device signs its own login
// sessions with. Never the cloud's JWT_SECRET, which must not leave the cloud.
const deviceConfig = (dataDir) => {
  const file = path.join(dataDir, "device.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const config = { jwtSecret: crypto.randomBytes(48).toString("hex"), createdAt: new Date().toISOString() };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
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
  const db = await openLocalDb(path.join(dataDir, "pgdata"));
  console.log(`Local database ready in ${Date.now() - started}ms`);

  Object.assign(process.env, {
    POS_RUNTIME: "device",
    DB_TENANT_RLS: "off", // one shop per device database; see plan-offline-sync.md
    JWT_SECRET: deviceConfig(dataDir).jwtSecret,
    PORT: String(port),
    APP_HTTPS: "false",
  });
  global.posDevice = { createPool: (driver) => createPglitePool(db, driver) };

  if (devShop) await createDevShop(devShop);
  require("../ExpressBackend/Server");

  return { url: `http://127.0.0.1:${port}`, close: () => db.close() };
};

module.exports = { startDevice };
