// Routes only a device's own backend has (mounted by Server.js when POS_RUNTIME=device): what
// state this device is in, and its first-run setup (setup.js). Unauthenticated on purpose —
// before setup there are no users to sign in as — and safe because the server only listens on
// this machine (127.0.0.1) and setup refuses once the device has a shop.
const path = require("path");
const express = require(require.resolve("express", { paths: [path.join(__dirname, "..", "ExpressBackend")] }));
const { startSetup, setupState } = require("./setup");

const APP_VERSION = require("./package.json").version;
const PLATFORM = process.platform === "android" ? "android" : "windows";

const deviceRoutes = ({ db, config, saveConfig, defaultCloudUrl }) => {
  const routes = express.Router();
  const hasShop = async () => (await db.query(`SELECT EXISTS (SELECT 1 FROM shops) AS yes`)).rows[0].yes;

  routes.get("/api/device/status", async (req, res, next) => {
    try {
      const { rows } = await db.query(`SELECT name FROM shops ORDER BY id LIMIT 1`);
      res.send({
        device: true,
        platform: PLATFORM,
        setUp: rows.length > 0,
        registered: Boolean(config.deviceToken),
        shopName: rows[0]?.name ?? null,
        deviceName: config.deviceName ?? null,
        receiptPrefix: config.receiptPrefix,
        cloudUrl: config.cloudUrl || defaultCloudUrl,
        snapshotAt: config.snapshotAt ?? null,
        setup: setupState(),
      });
    } catch (err) {
      next(err);
    }
  });

  routes.post("/api/device/setup", async (req, res, next) => {
    try {
      if (await hasShop()) return res.status(409).send({ message: "This device is already set up" });
      const { username, password, deviceName, cloudUrl } = req.body || {};
      if (!config.deviceToken && (!username || !password)) {
        return res.status(400).send({ message: "Enter the shop owner's username and password" });
      }
      const name = String(deviceName || "").trim();
      if (!config.deviceToken && !name) return res.status(400).send({ message: "Give this device a name" });
      const started = startSetup({
        db,
        config,
        saveConfig,
        cloudUrl: String(cloudUrl || config.cloudUrl || defaultCloudUrl),
        username,
        password,
        deviceName: name,
        platform: PLATFORM,
        appVersion: APP_VERSION,
      });
      if (!started) return res.status(409).send({ message: "Setup is already running" });
      res.status(202).send(setupState());
    } catch (err) {
      next(err);
    }
  });

  return routes;
};

module.exports = { deviceRoutes };
