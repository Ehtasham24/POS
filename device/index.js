// Starts the POS on a shop's own device: the local database, then the existing Express
// backend on top of it, in one process (see ../plan-offline-sync.md).
//
//   node index.js     (POS_DATA_DIR and POS_PORT override the defaults)
//
// POS_DEV_SHOP="name:owner_username:owner_password" creates a shop in an empty database — a
// stand-in for the first-run download from the cloud (phase 2), for local testing only.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { openLocalDb } = require("./localDb");
const { createPglitePool } = require("./pglitePool");

const DATA_DIR = process.env.POS_DATA_DIR || path.join(__dirname, "data");

// Per-device settings that must survive restarts: the secret this device signs its own login
// sessions with. Never the cloud's JWT_SECRET, which must not leave the cloud.
const deviceConfig = () => {
  const file = path.join(DATA_DIR, "device.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const config = { jwtSecret: crypto.randomBytes(48).toString("hex"), createdAt: new Date().toISOString() };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return config;
};

const createDevShop = async () => {
  const [name, ownerUsername, ownerPassword] = process.env.POS_DEV_SHOP.split(":");
  const { systemPool } = require("../ExpressBackend/Db");
  const { rows } = await systemPool.query(`SELECT COUNT(*)::int AS n FROM shops`);
  if (rows[0].n > 0) return;
  const { createShop } = require("../ExpressBackend/Sevices/adminService");
  await createShop({ name, tier: "advanced", ownerUsername, ownerPassword, maxUsers: 20 });
  console.log(`Created local shop "${name}"`);
};

const start = async () => {
  const started = Date.now();
  const db = await openLocalDb(path.join(DATA_DIR, "pgdata"));
  console.log(`Local database ready in ${Date.now() - started}ms`);

  Object.assign(process.env, {
    POS_RUNTIME: "device",
    DB_TENANT_RLS: "off", // one shop per device database; see plan-offline-sync.md
    JWT_SECRET: deviceConfig().jwtSecret,
    PORT: process.env.POS_PORT || "4100",
    WEBHOOK_PORT: process.env.POS_WEBHOOK_PORT || "4101",
    APP_HTTPS: "false",
  });
  global.posDevice = { createPool: (driver) => createPglitePool(db, driver) };

  if (process.env.POS_DEV_SHOP) await createDevShop();
  require("../ExpressBackend/Server");

  const shutdown = async () => {
    await db.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

start().catch((err) => {
  console.error("Device start failed:", err);
  process.exit(1);
});
