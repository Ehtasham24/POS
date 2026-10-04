// Routes only a device's own backend has (mounted by Server.js when POS_RUNTIME=device): what
// state this device is in, and its first-run setup (setup.js). Unauthenticated on purpose —
// before setup there are no users to sign in as — and safe because the server only listens on
// this machine (127.0.0.1) and setup refuses once the device has a shop.
const path = require("path");
const express = require(require.resolve("express", { paths: [path.join(__dirname, "..", "ExpressBackend")] }));
const { startSetup, setupState } = require("./setup");
const { readThrough } = require("./readThrough");

const APP_VERSION = require("./package.json").version;
const PLATFORM = process.platform === "android" ? "android" : "windows";

// Past this without reaching the cloud, a register stops selling until it syncs: its prices,
// stock and staff could be weeks out of date, and its sales unknown to the owner. Warned from
// WARN_AFTER_DAYS (plan-offline-sync.md, decided with the owner).
const BLOCK_AFTER_DAYS = 14;
const WARN_AFTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const deviceRoutes = ({ db, config, saveConfig, defaultCloudUrl, sync }) => {
  const routes = express.Router();
  // Through the backend's pool (loaded after these routes are built), so these reads queue with
  // the requests' transactions instead of landing in the middle of one (pglitePool.js).
  const query = (...args) => require("../ExpressBackend/Db").systemPool.query(...args);
  const offlineAge = () => {
    const days = config.lastSyncAt ? (Date.now() - new Date(config.lastSyncAt).getTime()) / DAY_MS : 0;
    return { daysSinceSync: Math.floor(days), warn: days >= WARN_AFTER_DAYS, blocked: days >= BLOCK_AFTER_DAYS };
  };

  // The cloud answered within the last minute (the sync worker runs every 10 seconds).
  const onlineNow = () => {
    const state = sync()?.state();
    return Boolean(state?.online && state.lastSyncAt && Date.now() - new Date(state.lastSyncAt).getTime() < 60000);
  };

  // Sales History and Sales Report from the cloud while online, this register's own otherwise.
  routes.use(readThrough({ config, sync, onlineNow }));

  // Mounted ahead of the sales routes (Server.js), so it runs before checkout.
  routes.post("/api/sales/checkout", async (req, res, next) => {
    try {
      if (config.deviceToken && offlineAge().blocked) {
        return res.status(409).send({
          message: `This register hasn't reached the internet for ${BLOCK_AFTER_DAYS} days. Connect it once to sync, then carry on selling.`,
        });
      }
      // A store-credit voucher is a slip anyone holding it can spend, and its balance lives in
      // the cloud: offline, two registers could each spend it in full. So offline, paying with
      // a voucher needs the owner's password (decided with the owner, plan-offline-sync.md).
      const usesVoucher = req.body?.voucherCode && Number(req.body.storeCreditRedeemed) > 0;
      const override = req.body?.voucherOverride;
      if (req.body) delete req.body.voucherOverride;
      if (config.deviceToken && usesVoucher && !onlineNow()) {
        if (!override?.ownerPassword) {
          return res.status(409).send({
            code: "VOUCHER_NEEDS_INTERNET",
            message: "This register is offline. Paying with a store-credit voucher offline needs the owner's password.",
          });
        }
        const { comparePassword } = require("../ExpressBackend/utils/auth");
        const { rows: owners } = await query(`SELECT password_hash FROM users WHERE role = 'owner' AND is_active`);
        let approved = false;
        for (const owner of owners) approved = approved || (await comparePassword(override.ownerPassword, owner.password_hash));
        if (!approved) return res.status(403).send({ code: "VOUCHER_NEEDS_INTERNET", message: "That isn't the owner's password." });
        console.log(`Offline voucher redemption approved by the owner (${req.body.voucherCode})`);
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  routes.post("/api/device/sync-now", async (req, res, next) => {
    try {
      if (!config.deviceToken) return res.status(409).send({ message: "This device isn't registered with the cloud" });
      await sync().syncNow();
      res.send({ ...sync().state(), ...offlineAge() });
    } catch (err) {
      next(err);
    }
  });

  const hasShop = async () => (await query(`SELECT EXISTS (SELECT 1 FROM shops) AS yes`)).rows[0].yes;

  routes.get("/api/device/status", async (req, res, next) => {
    try {
      const { rows } = await query(`SELECT name FROM shops ORDER BY id LIMIT 1`);
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
        sync: config.deviceToken ? { ...sync()?.state(), ...offlineAge() } : null,
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
        // Sync straight away rather than at the worker's next tick: until a first sync, this
        // register doesn't count as online (Sales History would answer from local data).
        onDone: () => sync()?.syncNow(),
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
