// Shared by the scripts that run registers against a TEMPORARY shop on a local cloud backend
// (sync-test.js, history-test.js): the cloud shop, the registers, and a cuttable "internet".
const path = require("path");
const { systemPool: cloudDb } = require("../../ExpressBackend/Db");
const { startDevice, client, login } = require("./harness");

const CLOUD = process.env.POS_CLOUD_URL || "https://localhost:4000";
const DEVICE_ENV = {
  POS_CLOUD_URL: CLOUD,
  NODE_EXTRA_CA_CERTS: path.join(__dirname, "..", "..", "mkcert-rootCA.pem"),
  NODE_TLS_REJECT_UNAUTHORIZED: "",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The internet, for one register: a TCP pass-through to the cloud that can be cut and restored.
// TLS goes through untouched, so the register still checks the cloud's certificate.
const net = require("net");
const createLine = (listenPort, target) => {
  const sockets = new Set();
  let server = null;
  const connect = () =>
    new Promise((resolve) => {
      server = net.createServer((inbound) => {
        const outbound = net.connect(target.port, target.host);
        for (const s of [inbound, outbound]) {
          sockets.add(s);
          s.on("close", () => sockets.delete(s));
          s.on("error", () => {});
        }
        inbound.pipe(outbound).pipe(inbound);
      });
      server.listen(listenPort, "127.0.0.1", resolve);
    });
  const cut = () =>
    new Promise((resolve) => {
      for (const s of sockets) s.destroy();
      server.close(() => resolve());
    });
  return { connect, cut, url: `https://localhost:${listenPort}` };
};

const cloudCall = async (token, method, url, body) => {
  const res = await fetch(CLOUD + url, {
    method,
    headers: { "content-type": "application/json", cookie: `pos_session=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const removeCloudShop = async (shopId) => {
  const { rows } = await cloudDb.query(
    `SELECT c.table_name FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND c.column_name = 'shop_id' AND t.table_type = 'BASE TABLE'`
  );
  let pending = rows.map((r) => r.table_name);
  for (let pass2 = 0; pass2 < 10 && pending.length; pass2++) {
    const failed = [];
    for (const table of pending) {
      try {
        await cloudDb.query(`DELETE FROM "${table}" WHERE shop_id = $1`, [shopId]);
      } catch {
        failed.push(table);
      }
    }
    pending = failed;
  }
  await cloudDb.query(`DELETE FROM shops WHERE id = $1`, [shopId]);
};

// A register: set up against the cloud shop, signed in as the owner.
const openRegister = async (dataRoot, name, port, owner, cloudUrl = CLOUD) => {
  const dataDir = path.join(dataRoot, name);
  const device = await startDevice({ dataDir, port, env: DEVICE_ENV });
  const anon = client(device.base, "");
  const started = await anon("POST", "/api/device/setup", { username: owner.username, password: owner.password, deviceName: name, cloudUrl });
  let status;
  for (let i = 0; i < 240; i++) {
    await sleep(250);
    status = (await anon("GET", "/api/device/status")).body;
    if (status.setup.status !== "running") break;
  }
  if (started.status !== 202 || !status.setUp) throw new Error(`${name} setup failed: ${JSON.stringify(status.setup)}`);
  const api = await login(device.base, owner.username, owner.password);
  return { name, port, dataDir, device, api, anon, prefix: status.receiptPrefix };
};

const syncNow = async (register) => {
  const res = await register.anon("POST", "/api/device/sync-now");
  if (res.status !== 200 || res.body.lastError) throw new Error(`${register.name} sync failed: ${JSON.stringify(res.body)}`);
  return res.body;
};

module.exports = { CLOUD, DEVICE_ENV, sleep, createLine, cloudCall, removeCloudShop, openRegister, syncNow };
