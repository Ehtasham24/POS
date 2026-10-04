// Sales History and Sales Report on a register (device/readThrough.js): online they come from
// the cloud and cover the shop's whole history, ids made to fit the register; offline they come
// from the register and say how far back they reach. Runs one register against a TEMPORARY
// cloud shop (removed at the end), with a sale on the web backdated past the 20 days the
// register keeps.
//
//   node scripts/history-test.js     (the cloud backend must be running: POS_CLOUD_URL,
//                                     default https://localhost:4000)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // this script's own calls to a local cloud
const fs = require("fs");
const path = require("path");
const { signToken } = require("../../ExpressBackend/utils/auth");
const { systemPool: cloudDb } = require("../../ExpressBackend/Db");
const { stopDevice, login } = require("./harness");
const { CLOUD, createLine, cloudCall, removeCloudShop, openRegister, syncNow } = require("./cloudHarness");

const DATA = path.join(__dirname, "..", "data", "history-test");
const DAY_MS = 24 * 60 * 60 * 1000;

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  OK  " : "  FAIL"} ${label}${ok ? "" : `  -> ${String(JSON.stringify(detail)).slice(0, 500)}`}`);
};

(async () => {
  const [admin] = (await cloudDb.query(`SELECT id, display_name FROM users WHERE role = 'superadmin' LIMIT 1`)).rows;
  const adminToken = signToken({ id: admin.id, role: "superadmin", displayName: admin.display_name });
  const stamp = Date.now().toString(36);
  let shopId = null;
  let A = null;
  try {
    // --- A cloud shop with an old sale and a recent one, and a register on a cuttable line.
    const owner = { username: `zz_hist_${stamp}`, password: "Hist-Owner-1" };
    const created = await cloudCall(adminToken, "POST", "/api/admin/shops", {
      name: `ZZ History ${stamp}`,
      tier: "advanced",
      ownerUsername: owner.username,
      ownerPassword: owner.password,
      maxUsers: 5,
    });
    shopId = created.body.shop.id;
    await cloudCall(adminToken, "PATCH", `/api/admin/shops/${shopId}`, { maxDevices: 1 });
    const web = signToken({ id: created.body.owner.id, role: "owner", displayName: "Owner" });
    const fans = (await cloudCall(web, "POST", "/categories", { category_name: "Fans" })).body;
    await cloudCall(web, "POST", "/product", { name: "ceiling fan", buying_price: 3000, quantity: 100, category_id: fans.id });
    await cloudCall(web, "POST", "/api/shifts", { openingFloat: 0 });
    const fanInCloud = (await cloudCall(web, "GET", "/products")).body.find((p) => p.productname === "ceiling fan");
    const webSale = async () =>
      (await cloudCall(web, "POST", "/api/sales/checkout", { items: [{ productID: fanInCloud.id, quantity: 1, sellingPrice: 4500 }], paymentMethod: "cash" })).body.data;
    const oldSale = await webSale();
    await cloudDb.query(
      `UPDATE sales SET sale_time = sale_time - INTERVAL '60 days' WHERE shop_id = $1 AND transaction_id = (SELECT id FROM sale_transactions WHERE receipt_no = $2 AND shop_id = $1)`,
      [shopId, oldSale.receiptNo]
    );
    await cloudDb.query(`UPDATE sale_transactions SET created_at = created_at - INTERVAL '60 days' WHERE receipt_no = $1 AND shop_id = $2`, [oldSale.receiptNo, shopId]);
    const recentSale = await webSale();

    fs.rmSync(DATA, { recursive: true, force: true });
    const cloudAddress = new URL(CLOUD);
    const line = createLine(4995, { host: cloudAddress.hostname, port: Number(cloudAddress.port) || 443 });
    await line.connect();
    A = await openRegister(DATA, "Counter PC", 4195, owner, line.url);
    await A.api("POST", "/api/shifts", { openingFloat: 0 });

    // --- Sales on the register, not yet sent: a fan, and a cooler in a category made here.
    const coolers = (await A.api("POST", "/categories", { category_name: "Coolers" })).body;
    await A.api("POST", "/product", { name: "room cooler", buying_price: 9000, quantity: 5, category_id: coolers.id });
    const products = (await A.api("GET", "/products")).body;
    const localId = (name) => products.find((p) => p.productname === name).id;
    const sell = async (name) =>
      (await A.api("POST", "/api/sales/checkout", { items: [{ productID: localId(name), quantity: 1, sellingPrice: 12000 }], paymentMethod: "cash" })).body.data;
    const fanSale = await sell("ceiling fan");
    const coolerSale = await sell("room cooler");

    const range = `startDate=${new Date(Date.now() - 90 * DAY_MS).toISOString().slice(0, 16)}&endDate=${new Date(Date.now() + DAY_MS).toISOString().slice(0, 16)}`;
    const history = async (api, extra = "") => (await api("GET", `/api/BilledHistory?${range}${extra}`)).body;
    const receiptsOf = (h) => (h.batches || []).map((b) => b[0].receipt_no).sort();

    // --- 1. Online: the whole history, the register's unsent sales included. They're sent first;
    // if that takes longer than the register waits, it answers itself and says why.
    const first = await history(A.api);
    check(
      `Right after selling: the cloud's answer, or the register's own marked "still sending" (${first.historySource}/${first.historyReason || "-"})`,
      first.historySource === "cloud" ? first.totalCount === 4 : first.historyReason === "sending",
      first
    );
    await syncNow(A);
    const online = await history(A.api);
    check(
      `Online, history comes from the cloud and has all 4 sales (${receiptsOf(online).join(", ")})`,
      online.historySource === "cloud" && online.totalCount === 4 && [oldSale, recentSale, fanSale, coolerSale].every((s) => receiptsOf(online).includes(s.receiptNo)),
      online
    );
    const lines = (h, receipt) => (h.batches || []).find((b) => b[0].receipt_no === receipt) || [];
    const oldLine = lines(online, oldSale.receiptNo)[0];
    check("The 60-day-old web sale is marked remote (not kept on the register)", oldLine?.remote === true && String(oldLine.id).startsWith("remote-"), oldLine);
    const fanLine = lines(online, fanSale.receiptNo)[0];
    check(
      "The register's own sale carries the register's ids (sale, product, seller)",
      !fanLine?.remote && fanLine.id >= 1e9 && fanLine.product_id === localId("ceiling fan") && fanLine.sold_by === A.api.user.id,
      { fanLine, user: A.api.user.id }
    );
    const recentLine = lines(online, recentSale.receiptNo)[0];
    check("A recent web sale (kept on the register) is not remote", recentLine && !recentLine.remote, recentLine);
    const refund = await A.api("POST", `/api/sales/${fanLine.id}/refunds`, { quantity: 1, refundAmount: 12000, refundMethod: "cash", condition: "resellable", reason: "history test" });
    check("A refund using the id from the cloud's list works on the register", refund.status === 200, refund.body);

    const byCategory = await history(A.api, `&categoryId=${coolers.id}`);
    check(
      "Filtering by a category made on the register finds just its sale",
      byCategory.historySource === "cloud" && byCategory.totalCount === 1 && lines(byCategory, coolerSale.receiptNo).length === 1,
      byCategory
    );

    const reportBody = { startDate: new Date(Date.now() - 90 * DAY_MS).toISOString(), endDate: new Date(Date.now() + DAY_MS).toISOString() };
    const summary = (await A.api("POST", "/api/Sales/summary", reportBody)).body;
    check(`Sales Report summary comes from the cloud over the whole range (${summary.current?.transactions} sales)`, summary.historySource === "cloud" && summary.current?.transactions === 4, summary);
    const localCategories = (await A.api("GET", "/categories")).body.map((c) => c.id);
    const breakdowns = (await A.api("POST", "/api/Sales/breakdowns", reportBody)).body;
    check(
      "Report breakdowns name the register's own categories and staff",
      breakdowns.byCategory.length === 2 && breakdowns.byCategory.every((c) => localCategories.includes(c.category_id)) && breakdowns.byCashier.some((c) => c.user_id === A.api.user.id),
      breakdowns
    );
    const productRows = (await A.api("POST", "/api/Sales/products", { ...reportBody, categoryId: coolers.id })).body;
    check(
      "Product report filtered by a register category gives that product, with its register id",
      productRows.rows?.length === 1 && productRows.rows[0].productId === localId("room cooler") && productRows.rows[0].categoryId === coolers.id,
      productRows
    );

    // --- 2. A cashier: the cloud applies their rules (own sales today; no report).
    const cashier = { username: `${owner.username}_c`, password: "Hist-Cashier-1" };
    await cloudCall(web, "POST", "/api/users", { username: cashier.username, password: cashier.password, displayName: "Cashier", role: "cashier" });
    await syncNow(A);
    const cashierApi = await login(A.device.base, cashier.username, cashier.password);
    const cashierHistory = await history(cashierApi);
    check("A cashier's history comes from the cloud with only their own sales (none)", cashierHistory.historySource === "cloud" && cashierHistory.totalCount === 0, cashierHistory);
    const cashierReport = await cashierApi("POST", "/api/Sales/summary", reportBody);
    check("A cashier still can't open the Sales Report", cashierReport.status === 403, cashierReport);

    // --- 3. Offline: the register's own sales only, and it says from when.
    await line.cut();
    await A.anon("POST", "/api/device/sync-now");
    const offline = await history(A.api);
    check(
      `Offline, history is the register's own (${receiptsOf(offline).join(", ")}) and says from when`,
      offline.historySource === "local" && offline.historyFrom && offline.totalCount === 3 && !receiptsOf(offline).includes(oldSale.receiptNo),
      offline
    );
    const offlineSummary = (await A.api("POST", "/api/Sales/summary", reportBody)).body;
    check("Offline, the report is the register's own too", offlineSummary.historySource === "local" && offlineSummary.current?.transactions === 3, offlineSummary);

    await line.connect();
    await syncNow(A);
    check("Back online, the cloud answers again", (await history(A.api)).historySource === "cloud", null);

    // --- 4. The cloud side: only a known device, as one of its own shop's people, on these reads.
    const config = JSON.parse(fs.readFileSync(path.join(A.dataDir, "device.json"), "utf8"));
    const token = config.deviceToken;
    if (token) {
      const [ownerRow] = (await cloudDb.query(`SELECT uuid FROM users WHERE shop_id = $1 AND role = 'owner'`, [shopId])).rows;
      const [stranger] = (await cloudDb.query(`SELECT uuid FROM users WHERE shop_id <> $1 AND role = 'owner' LIMIT 1`, [shopId])).rows;
      const asDevice = (url, deviceToken, userUuid) =>
        fetch(CLOUD + url, { headers: { authorization: `Device ${deviceToken}`, "x-pos-user": userUuid } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
      const good = await asDevice(`/api/BilledHistory?${range}`, token, ownerRow.uuid);
      const uuidLike = /^[0-9a-f-]{36}$/;
      check("The cloud answers its device with uuids, not its own ids", good.status === 200 && good.body.batches.flat().every((s) => uuidLike.test(s.id) && uuidLike.test(s.sold_by)), good.body);
      check("A wrong device token is refused", (await asDevice(`/api/BilledHistory?${range}`, "nope", ownerRow.uuid)).status === 401, null);
      check("Someone from another shop is refused", stranger && (await asDevice(`/api/BilledHistory?${range}`, token, stranger.uuid)).status === 401, null);
      check("Only the history reads take a device token (inventory doesn't)", (await asDevice("/api/inventory", token, ownerRow.uuid)).status === 401, null);
    } else {
      console.log("  (skipped the cloud-side checks: the device token is stored encrypted here)");
    }
  } catch (err) {
    fail++;
    console.error("CRASH", err);
  } finally {
    if (A) {
      await stopDevice(A.device.child).catch(() => {});
      if (fail) {
        const log = A.device.log().split("\n").filter((l) => l.trim() && !/^\s+at /.test(l));
        console.log(`--- register log (tail) ---\n${log.slice(-15).join("\n")}`);
      }
    }
    if (shopId) await removeCloudShop(shopId);
    fs.rmSync(DATA, { recursive: true, force: true });
    await cloudDb.end();
    process.stdout.write(`\n${pass} passed, ${fail} failed\n`, () => process.exit(fail ? 1 : 0));
  }
})();
