// Phase 3 sync simulator: two registers (P1, P2) and the web app on one TEMPORARY cloud shop
// (removed at the end), going through what a shop does — sales on every register, a product
// made on one register, price changes and a new cashier on the web, a refund of another
// register's sale, the last unit sold twice offline, names clashing, a register killed before
// it synced, a register retired — and checking after each sync that everyone agrees.
//
//   node scripts/sync-test.js        (the cloud backend must be running: POS_CLOUD_URL,
//                                     default https://localhost:4000)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // this script's own calls to a local cloud
const fs = require("fs");
const path = require("path");
const { signToken } = require("../../ExpressBackend/utils/auth");
const { systemPool: cloudDb } = require("../../ExpressBackend/Db");
const { startDevice, stopDevice, killDevice, client, login } = require("./harness");

const CLOUD = process.env.POS_CLOUD_URL || "https://localhost:4000";
const DATA = path.join(__dirname, "..", "data", "sync-test");
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

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  OK  " : "  FAIL"} ${label}${ok ? "" : `  -> ${JSON.stringify(detail).slice(0, 500)}`}`);
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
const openRegister = async (name, port, owner, cloudUrl = CLOUD) => {
  const dataDir = path.join(DATA, name);
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

const stockOn = async (api, productName) => {
  const product = (await api("GET", "/products")).body.find((p) => p.productname === productName);
  return product ? Number(product.quantity) : undefined;
};
const cloudStock = async (shopId, productName) => {
  const { rows } = await cloudDb.query(`SELECT quantity FROM products WHERE shop_id = $1 AND productname = $2`, [shopId, productName]);
  return rows[0] ? Number(rows[0].quantity) : undefined;
};

(async () => {
  const [admin] = (await cloudDb.query(`SELECT id, display_name FROM users WHERE role = 'superadmin' LIMIT 1`)).rows;
  const adminToken = signToken({ id: admin.id, role: "superadmin", displayName: admin.display_name });
  const stamp = Date.now().toString(36);
  let shopId = null;
  const registers = [];
  try {
    // --- The cloud shop and two registers.
    const owner = { username: `zz_sync_${stamp}`, password: "Sync-Owner-1" };
    const created = await cloudCall(adminToken, "POST", "/api/admin/shops", {
      name: `ZZ Sync ${stamp}`,
      tier: "advanced",
      ownerUsername: owner.username,
      ownerPassword: owner.password,
      maxUsers: 5,
    });
    shopId = created.body.shop.id;
    await cloudCall(adminToken, "PATCH", `/api/admin/shops/${shopId}`, { maxDevices: 2 });
    const web = signToken({ id: created.body.owner.id, role: "owner", displayName: "Owner" });
    const cat = (await cloudCall(web, "POST", "/categories", { category_name: "Fans" })).body;
    for (const name of ["ceiling fan", "pedestal fan", "last unit"]) {
      await cloudCall(web, "POST", "/product", { name, buying_price: 3000, quantity: name === "last unit" ? 1 : 100, category_id: cat.id });
    }
    await cloudCall(web, "POST", "/api/shifts", { openingFloat: 0 });

    fs.rmSync(DATA, { recursive: true, force: true });
    const A = await openRegister("Counter PC", 4191, owner);
    // P2 reaches the cloud through a line the test can cut (section 10).
    const cloudAddress = new URL(CLOUD);
    const line = createLine(4994, { host: cloudAddress.hostname, port: Number(cloudAddress.port) || 443 });
    await line.connect();
    const B = await openRegister("Back PC", 4193, owner, line.url);
    registers.push(A, B);
    check(`Two registers set up (${A.prefix}, ${B.prefix})`, A.prefix === "P1" && B.prefix === "P2", [A.prefix, B.prefix]);
    for (const r of registers) await r.api("POST", "/api/shifts", { openingFloat: 0 });

    const productId = async (r, name) => (await r.api("GET", "/products")).body.find((p) => p.productname === name).id;
    const sell = async (r, name, quantity) =>
      (await r.api("POST", "/api/sales/checkout", { items: [{ productID: await productId(r, name), quantity, sellingPrice: 4500 }], paymentMethod: "cash" })).body.data;

    // --- 1. Sales on both registers and the web, then everyone agrees on stock.
    const saleA = await sell(A, "ceiling fan", 3);
    const saleB = await sell(B, "ceiling fan", 2);
    const cloudProduct = (await cloudCall(web, "GET", "/products")).body.find((p) => p.productname === "ceiling fan");
    await cloudCall(web, "POST", "/api/sales/checkout", { items: [{ productID: cloudProduct.id, quantity: 1, sellingPrice: 4500 }], paymentMethod: "card" });
    await syncNow(A);
    await syncNow(B);
    await syncNow(A);
    const stocks = [await cloudStock(shopId, "ceiling fan"), await stockOn(A.api, "ceiling fan"), await stockOn(B.api, "ceiling fan")];
    check(`Sales on P1, P2 and the web: stock 100-3-2-1 = 94 everywhere (${stocks.join(", ")})`, stocks.every((s) => s === 94), stocks);
    const { rows: receipts } = await cloudDb.query(`SELECT receipt_no FROM sale_transactions WHERE shop_id = $1 ORDER BY receipt_no`, [shopId]);
    check(
      `The cloud has every receipt under its register's number (${receipts.map((r) => r.receipt_no).join(", ")})`,
      receipts.some((r) => r.receipt_no === saleA.receiptNo) && receipts.some((r) => r.receipt_no === saleB.receiptNo) && receipts.some((r) => r.receipt_no.startsWith("RCPT-")),
      receipts
    );
    const historyOnB = (await B.api("GET", `/api/BilledHistory?receiptNo=${saleA.receiptNo}`)).body;
    check("P2 sees P1's sale in its history", historyOnB.totalCount === 1, historyOnB);

    // --- 2. A product made on P1 reaches the cloud and P2, under the right category.
    await A.api("POST", "/product", { name: "room cooler", buying_price: 9000, quantity: 12, category_id: (await A.api("GET", "/categories")).body[0].id });
    await syncNow(A);
    await syncNow(B);
    const coolerOnB = (await B.api("GET", "/products")).body.find((p) => p.productname === "room cooler");
    const { rows: coolerInCloud } = await cloudDb.query(
      `SELECT p.quantity, c.category_name FROM products p JOIN categories c ON c.id = p.category_id WHERE p.shop_id = $1 AND p.productname = 'room cooler'`,
      [shopId]
    );
    check("A product made on P1 is in the cloud (right category) and on P2", coolerInCloud[0]?.category_name === "Fans" && Number(coolerInCloud[0].quantity) === 12 && Number(coolerOnB?.quantity) === 12, { coolerInCloud, coolerOnB });

    // --- 3. The web changes a price and adds a cashier; the registers get both.
    await cloudCall(web, "PUT", `/products/${cloudProduct.id}`, { name: "ceiling fan", price: 3200, Category_id: cat.id });
    const cashierName = `${owner.username}_c`;
    await cloudCall(web, "POST", "/api/users", { username: cashierName, password: "Sync-Cashier-1", displayName: "New Cashier", role: "cashier" });
    await syncNow(A);
    const fanOnA = (await A.api("GET", "/products")).body.find((p) => p.productname === "ceiling fan");
    check("A cost price changed on the web reaches P1", Number(fanOnA.buyingprice) === 3200, fanOnA);
    const cashierOnA = await login(A.device.base, cashierName, "Sync-Cashier-1").catch((e) => e);
    check("A cashier added on the web can sign in on P1", !(cashierOnA instanceof Error), String(cashierOnA));

    // --- 4. A refund on P2 of P1's sale lands in the cloud against that sale.
    const saleAOnB = (await B.api("GET", `/api/BilledHistory?receiptNo=${saleA.receiptNo}`)).body.batches[0];
    const saleLineOnB = (saleAOnB.items || saleAOnB.sales || saleAOnB)[0] ?? saleAOnB;
    const refund = await B.api("POST", `/api/sales/${saleLineOnB.id ?? saleLineOnB.sale_id}/refunds`, { quantity: 1, refundAmount: 4500, refundMethod: "cash", condition: "resellable", reason: "sync test" });
    await syncNow(B);
    await syncNow(A);
    const { rows: refundInCloud } = await cloudDb.query(
      `SELECT r.receipt_no, st.receipt_no AS sale_receipt FROM refunds r JOIN sales s ON s.id = r.sale_id JOIN sale_transactions st ON st.id = s.transaction_id WHERE r.shop_id = $1`,
      [shopId]
    );
    check(
      `A refund on P2 (${refund.body?.refundNo}) of P1's sale is linked to it in the cloud`,
      refund.status < 300 && refundInCloud[0]?.receipt_no === refund.body.refundNo && refundInCloud[0]?.sale_receipt === saleA.receiptNo,
      { refund: refund.body, refundInCloud }
    );
    const afterRefund = [await cloudStock(shopId, "ceiling fan"), await stockOn(A.api, "ceiling fan"), await stockOn(B.api, "ceiling fan")];
    check(`The refunded unit is back on the shelf everywhere (95: ${afterRefund.join(", ")})`, afterRefund.every((s) => s === 95), afterRefund);

    // --- 5. The last unit sold on both registers before either synced: both sales kept, stock -1.
    await sell(A, "last unit", 1);
    await sell(B, "last unit", 1);
    await syncNow(A);
    await syncNow(B);
    await syncNow(A);
    const lastUnit = [await cloudStock(shopId, "last unit"), await stockOn(A.api, "last unit"), await stockOn(B.api, "last unit")];
    check(`The last unit sold twice offline: both sales kept, stock -1 everywhere (${lastUnit.join(", ")})`, lastUnit.every((s) => s === -1), lastUnit);
    if (!lastUnit.every((s) => s === -1)) {
      const { rows: feed } = await cloudDb.query(
        `SELECT c.id, c.xid::text, c.op, c.changed_at FROM sync_changes c JOIN products p ON p.uuid::text = c.row_key WHERE p.shop_id = $1 AND p.productname = 'last unit' ORDER BY c.id`,
        [shopId]
      );
      const cursors = registers.map((r) => JSON.parse(fs.readFileSync(path.join(r.dataDir, "device.json"), "utf8")).feedCursor);
      const statusB = (await B.anon("GET", "/api/device/status")).body.sync;
      console.log("   DEBUG feed for last unit:", JSON.stringify(feed), "| cursors A,B:", cursors, "| B sync:", JSON.stringify(statusB));
    }

    // --- 6. Same category name made on both registers offline: both kept, P2's marked.
    await A.api("POST", "/categories", { category_name: "Coolers" });
    await B.api("POST", "/categories", { category_name: "Coolers" });
    await syncNow(A);
    await syncNow(B);
    await syncNow(A);
    const { rows: coolersCats } = await cloudDb.query(`SELECT category_name FROM categories WHERE shop_id = $1 AND category_name LIKE 'Coolers%' ORDER BY 1`, [shopId]);
    const catsOnA = (await A.api("GET", "/categories")).body.map((c) => c.category_name).filter((n) => n.startsWith("Coolers")).sort();
    check(`A name made on both registers offline is kept twice, the later one marked (${coolersCats.map((c) => c.category_name).join(", ")})`, coolersCats.length === 2 && coolersCats[1].category_name === "Coolers (P2)" && JSON.stringify(catsOnA) === JSON.stringify(coolersCats.map((c) => c.category_name)), { coolersCats, catsOnA });

    // --- 7. A register killed right after selling, before it synced: nothing is lost.
    const unsynced = await sell(B, "pedestal fan", 4);
    await killDevice(B.device.child);
    B.device = await startDevice({ dataDir: B.dataDir, port: B.port, env: DEVICE_ENV });
    B.api = await login(B.device.base, owner.username, owner.password);
    B.anon = client(B.device.base, "");
    await syncNow(B);
    const { rows: survived } = await cloudDb.query(`SELECT 1 FROM sale_transactions WHERE shop_id = $1 AND receipt_no = $2`, [shopId, unsynced.receiptNo]);
    check(`A sale made just before P2 was killed reaches the cloud after restart (${unsynced.receiptNo})`, survived.length === 1 && (await cloudStock(shopId, "pedestal fan")) === 96, survived);

    // --- 8. Everyone agrees: sales count and totals.
    await syncNow(A);
    await syncNow(B);
    const day = { startDate: "2026-01-01T00:00", endDate: "2027-12-31T23:59" };
    const cloudSummary = (await cloudCall(web, "POST", "/api/Sales/summary", day)).body.current;
    const aSummary = (await A.api("POST", "/api/Sales/summary", day)).body.current;
    const bSummary = (await B.api("POST", "/api/Sales/summary", day)).body.current;
    const pick = (s) => [s.transactions, s.grossSales, s.refunds, s.itemsSold];
    check(
      `The sales report agrees on the cloud, P1 and P2 (${JSON.stringify(pick(cloudSummary))})`,
      JSON.stringify(pick(cloudSummary)) === JSON.stringify(pick(aSummary)) && JSON.stringify(pick(aSummary)) === JSON.stringify(pick(bSummary)),
      { cloud: pick(cloudSummary), A: pick(aSummary), B: pick(bSummary) }
    );
    const { rows: rejections } = await cloudDb.query(`SELECT event_type, reason FROM sync_rejections WHERE shop_id = $1`, [shopId]);
    check("Nothing was rejected along the way (so far)", rejections.length === 0, rejections);
    const { rows: deviceRows } = await cloudDb.query(`SELECT name, pending_count, last_push_at IS NOT NULL AS pushed, last_pull_at IS NOT NULL AS pulled FROM devices WHERE shop_id = $1 ORDER BY name`, [shopId]);
    check("The cloud records each register's last sync and nothing pending", deviceRows.length === 2 && deviceRows.every((d) => d.pushed && d.pulled && d.pending_count === 0), deviceRows);

    // --- 10. Offline (phase 4): P2 loses the internet.
    await line.cut();
    const offlineSale = await sell(B, "pedestal fan", 1);
    const offlineSync = (await B.anon("POST", "/api/device/sync-now")).body;
    check(
      `Offline, P2 keeps selling (${offlineSale?.receiptNo}) and reports itself offline with sales waiting`,
      Boolean(offlineSale?.receiptNo) && offlineSync.online === false && offlineSync.pending > 0,
      offlineSync
    );

    // A store-credit voucher, issued on the web; offline it needs the owner's password on P2.
    const webSale = (
      await cloudCall(web, "POST", "/api/sales/checkout", {
        items: [{ productID: cloudProduct.id, quantity: 1, sellingPrice: 4500 }],
        paymentMethod: "cash",
      })
    ).body.data;
    const voucher = (
      await cloudCall(web, "POST", `/api/sales/${webSale.items[0].saleId}/refunds`, {
        quantity: 1,
        refundAmount: 4500,
        refundMethod: "store_credit",
        condition: "resellable",
        reason: "sync test voucher",
      })
    ).body.refundNo;
    await line.connect();
    await syncNow(B);
    await line.cut();
    await B.anon("POST", "/api/device/sync-now"); // fails: the register now knows it's offline
    const fanId = await productId(B, "ceiling fan");
    const withVoucher = (extra = {}) =>
      B.api("POST", "/api/sales/checkout", {
        items: [{ productID: fanId, quantity: 1, sellingPrice: 4500 }],
        paymentMethod: "cash",
        voucherCode: voucher,
        storeCreditRedeemed: 4500,
        ...extra,
      });
    const refused = await withVoucher();
    check("Offline, paying with a voucher asks for the owner's password", refused.status === 409 && refused.body.code === "VOUCHER_NEEDS_INTERNET", refused);
    const wrongPassword = await withVoucher({ voucherOverride: { ownerPassword: "not-it" } });
    check("A wrong owner password is refused", wrongPassword.status === 403, wrongPassword);
    const approved = await withVoucher({ voucherOverride: { ownerPassword: owner.password } });
    check("With the owner's password the voucher sale goes through offline", approved.status === 200 && Number(approved.body.data.creditApplied) === 4500, approved);

    // Something the cloud can't accept, made offline: a username another device took first.
    const takenName = `${owner.username}_dup`;
    await B.api("POST", "/api/users", { username: takenName, password: "Sync-Cashier-1", displayName: "Dup", role: "cashier" });
    await cloudCall(web, "POST", "/api/users", { username: takenName, password: "Sync-Cashier-1", displayName: "Dup web", role: "cashier" });

    // Back online: everything sent, the voucher spent in the cloud, the clash reported.
    await line.connect();
    const backOnline = await syncNow(B);
    const { rows: arrived } = await cloudDb.query(`SELECT 1 FROM sale_transactions WHERE shop_id = $1 AND receipt_no = $2`, [shopId, offlineSale.receiptNo]);
    const balance = (await cloudCall(web, "GET", `/api/store-credit/lookup/${voucher}`)).body;
    check(
      "Back online, P2's offline sales reach the cloud and the voucher is spent there",
      arrived.length === 1 && backOnline.pending === 0 && backOnline.online === true && Number(balance.balance ?? balance.voucher?.balance) === 0,
      { arrived, backOnline, balance }
    );
    const issues = (await cloudCall(web, "GET", "/api/devices/rejections")).body.rejections;
    check(
      `What the cloud couldn't accept is listed for the owner (${issues.map((i) => i.event_type).join(", ")})`,
      issues.length === 1 && issues[0].event_type === "users.insert" && /clashes/.test(issues[0].reason),
      issues
    );
    await cloudCall(web, "PATCH", `/api/devices/rejections/${issues[0].id}/resolve`);
    const afterResolve = (await cloudCall(web, "GET", "/api/devices/rejections")).body.rejections;
    check("The owner marks it handled", afterResolve.length === 0, afterResolve);

    // The owner's Devices list, the admin's shop detail and Health.
    const list = (await cloudCall(web, "GET", "/api/devices")).body;
    check(
      "The owner's Devices list shows both registers in sync, and the limit",
      list.limit === 2 && list.devices.length === 2 && list.devices.every((d) => d.sync_state === "in_sync"),
      list
    );
    const adminDetail = (await cloudCall(adminToken, "GET", `/api/admin/shops/${shopId}/detail`)).body;
    check("The admin's shop detail lists the registers", adminDetail.devices?.length === 2, adminDetail.devices);
    const health = (await cloudCall(adminToken, "GET", "/api/admin/health")).body;
    check("Health lists registers needing attention (none of these)", Array.isArray(health.devices) && !health.devices.some((d) => d.shop_id === shopId), health.devices);

    // Two weeks without the internet: P2 stops selling until it syncs.
    await line.cut();
    await stopDevice(B.device.child);
    const configPath = path.join(B.dataDir, "device.json");
    const stale = JSON.parse(fs.readFileSync(configPath, "utf8"));
    stale.lastSyncAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(configPath, JSON.stringify(stale, null, 2));
    B.device = await startDevice({ dataDir: B.dataDir, port: B.port, env: DEVICE_ENV });
    B.api = await login(B.device.base, owner.username, owner.password);
    B.anon = client(B.device.base, "");
    const blockedSale = await B.api("POST", "/api/sales/checkout", { items: [{ productID: fanId, quantity: 1, sellingPrice: 4500 }], paymentMethod: "cash" });
    const blockedStatus = (await B.anon("GET", "/api/device/status")).body.sync;
    check("After 14 days offline the register refuses sales and says why", blockedSale.status === 409 && blockedStatus.blocked === true, { blockedSale, blockedStatus });
    await line.connect();
    await syncNow(B);
    const unblocked = await B.api("POST", "/api/sales/checkout", { items: [{ productID: fanId, quantity: 1, sellingPrice: 4500 }], paymentMethod: "cash" });
    check("One sync later it sells again", unblocked.status === 200, unblocked);

    // --- 9. A retired register is cut off.
    const bId = (await cloudDb.query(`SELECT id FROM devices WHERE shop_id = $1 AND receipt_prefix = 'P2'`, [shopId])).rows[0].id;
    await cloudCall(web, "PATCH", `/api/devices/${bId}/status`, { status: "retired" });
    const afterRetire = await B.anon("POST", "/api/device/sync-now");
    check("A retired register's sync is refused", /retired/i.test(afterRetire.body?.lastError || ""), afterRetire.body);
  } catch (err) {
    fail++;
    console.error("CRASH", err);
  } finally {
    for (const r of registers) {
      await stopDevice(r.device.child).catch(() => {});
      if (fail) {
        const log = r.device.log().split("\n").filter((l) => l.trim() && !/^\s+at /.test(l));
        console.log(`--- ${r.name} log (tail) ---\n${log.slice(-15).join("\n")}`);
      }
    }
    if (shopId) await removeCloudShop(shopId);
    fs.rmSync(DATA, { recursive: true, force: true });
    await cloudDb.end();
    process.stdout.write(`\n${pass} passed, ${fail} failed\n`, () => process.exit(fail ? 1 : 0));
  }
})();
