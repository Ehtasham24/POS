// Phase 0 power-cut test: kills the device process mid-sale over and over — the software side of
// load-shedding pulling the plug — and checks after every restart that:
//   - the database opens (no corruption);
//   - every sale the register confirmed is still there (nothing acknowledged is lost);
//   - no sale is half-written: each product's stock + units sold = its opening stock;
//   - the sales count is between "confirmed" and "confirmed + in flight at the kill".
// It also kills the very first start mid-setup a few times, then checks a normal start works.
//
//   node scripts/power-cut.js [--rounds=100] [--cashiers=3]
//
// A killed process keeps what it already handed to the operating system, so this proves the
// database never commits half a sale and never loses a confirmed one when the app dies; a
// real power cut (losing the OS's own write cache) needs the same run on hardware whose plug
// is actually pulled — see plan-offline-sync.md.
const fs = require("fs");
const path = require("path");
const { startDevice, killDevice, stopDevice, login } = require("./harness");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
};
const ROUNDS = arg("rounds", 100);
const CASHIERS = arg("cashiers", 3);
const DATA_DIR = path.join(__dirname, "..", "data", "power-cut");
const PORT = 4130;
const OPENING_STOCK = 1000000;
const DEV_SHOP = { POS_DEV_SHOP: "Power Cut Shop:pc_owner:Power-Cut-Owner-1" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++;
  else fail++;
  if (!ok) console.log(`  FAIL ${label}  -> ${JSON.stringify(detail).slice(0, 400)}`);
  return ok;
};

const pad = (n) => String(n).padStart(2, "0");
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const range = () => ({ startDate: `${day(new Date(Date.now() - 86400000))}T00:00`, endDate: `${day(new Date(Date.now() + 86400000))}T23:59` });

// Kills the first start while it is still creating the database, a few times, then proves a
// normal start still works on whatever was left behind.
const killDuringFirstStart = async () => {
  for (let i = 0; i < 5; i++) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    const pending = startDevice({ dataDir: DATA_DIR, port: PORT, env: DEV_SHOP });
    pending.catch(() => {}); // the kill below makes it reject
    await sleep(300 + Math.random() * 4000);
    // startDevice resolves with the child only once listening; reach it through the process list instead.
    const { execSync } = require("child_process");
    try {
      execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object { $_.CommandLine -like '*device*index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
        { stdio: "ignore" }
      );
    } catch {}
    await pending.then((d) => killDevice(d.child)).catch(() => {});
    await sleep(300);
    const device = await startDevice({ dataDir: DATA_DIR, port: PORT, env: DEV_SHOP }).catch((err) => err);
    const ok = check(`Start after a kill during first start #${i + 1}`, !(device instanceof Error), String(device).slice(0, 300));
    if (ok) {
      const owner = await login(device.base, "pc_owner", "Power-Cut-Owner-1").catch((err) => err);
      check(`Owner can log in after kill during first start #${i + 1}`, !(owner instanceof Error), String(owner));
      await stopDevice(device.child);
    }
  }
};

(async () => {
  const started = Date.now();
  let device;
  try {
    await killDuringFirstStart();
    console.log(`First-start kills: ${pass} checks passed, ${fail} failed`);

    // A clean shop for the sales rounds.
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    device = await startDevice({ dataDir: DATA_DIR, port: PORT, env: DEV_SHOP });
    let owner = await login(device.base, "pc_owner", "Power-Cut-Owner-1");
    const category = await owner("POST", "/categories", { category_name: "General" });
    const products = [];
    for (let i = 0; i < 8; i++) {
      const res = await owner("POST", "/product", { name: `pc item ${i}`, buying_price: 100, quantity: OPENING_STOCK, category_id: category.body.id });
      products.push({ id: res.body.product.id, name: res.body.product.productname });
    }
    for (let i = 0; i < CASHIERS; i++) {
      await owner("POST", "/api/users", { username: `pc_cashier_${i}`, password: "Power-Cut-Cashier-1", displayName: `Cashier ${i}`, role: "cashier" });
      const cashier = await login(device.base, `pc_cashier_${i}`, "Power-Cut-Cashier-1");
      await cashier("POST", "/api/shifts", { openingFloat: 0 });
    }
    await stopDevice(device.child);

    let confirmed = 0;
    let unconfirmed = 0; // sent but no answer before the kill: may or may not have committed
    // Everything up to the last kill: no half-written sale, and no confirmed sale missing.
    const verifyState = async (owner, round) => {
      const report = (await owner("POST", "/api/Sales/products", { ...range(), page: 1, pageSize: 100 })).body;
      const soldByName = new Map(report.rows.map((r) => [r.productname, Number(r.qtySold)]));
      const stock = new Map((await owner("GET", "/products")).body.map((p) => [p.id, Number(p.quantity)]));
      const broken = products.filter((p) => stock.get(p.id) + (soldByName.get(p.name) || 0) !== OPENING_STOCK);
      check(`Round ${round}: stock + units sold = opening stock for every product (no half-written sale)`, broken.length === 0,
        broken.map((p) => ({ name: p.name, stock: stock.get(p.id), sold: soldByName.get(p.name) })));
      const { transactions } = (await owner("POST", "/api/Sales/summary", range())).body.current;
      check(`Round ${round}: sale count within confirmed..confirmed+in-flight`, transactions >= confirmed && transactions <= confirmed + unconfirmed,
        { transactions, confirmed, unconfirmed });
      confirmed = transactions; // the in-flight ones that made it are now simply sales
      unconfirmed = 0;
    };
    const startTimes = [];
    for (let round = 1; round <= ROUNDS; round++) {
      device = await startDevice({ dataDir: DATA_DIR, port: PORT }).catch((err) => err);
      if (!check(`Round ${round}: device starts after the kill`, !(device instanceof Error), String(device).slice(-600))) break;
      startTimes.push(device.startMs);
      owner = await login(device.base, "pc_owner", "Power-Cut-Owner-1");

      await verifyState(owner, round);

      // Sell, then pull the plug at a random moment.
      const cashiers = await Promise.all(Array.from({ length: CASHIERS }, (_, i) => login(device.base, `pc_cashier_${i}`, "Power-Cut-Cashier-1")));
      const receipts = [];
      let killed = false;
      const selling = cashiers.map(async (cashier) => {
        while (!killed) {
          const items = products.slice().sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3))
            .map((p) => ({ productID: p.id, quantity: 1 + Math.floor(Math.random() * 3), sellingPrice: 200 }));
          unconfirmed++;
          try {
            const res = await cashier("POST", "/api/sales/checkout", { items, paymentMethod: "cash" });
            if (res.status === 200) {
              unconfirmed--;
              confirmed++;
              receipts.push(res.body.data.receiptNo);
            } else if (!killed) {
              unconfirmed--;
              check(`Round ${round}: checkout succeeds before the kill`, false, res);
            }
          } catch {
            // Connection cut by the kill: stays counted as in flight.
          }
        }
      });
      await sleep(200 + Math.random() * 2500);
      killed = true;
      await killDevice(device.child);
      await Promise.all(selling);

      // Next round's start verifies the counts; check this round's receipts individually there.
      device = await startDevice({ dataDir: DATA_DIR, port: PORT }).catch((err) => err);
      if (!check(`Round ${round}: device restarts to verify receipts`, !(device instanceof Error), String(device).slice(-600))) break;
      owner = await login(device.base, "pc_owner", "Power-Cut-Owner-1");
      const missing = [];
      for (const receiptNo of receipts) {
        const res = await owner("GET", `/api/BilledHistory?receiptNo=${receiptNo}&startDate=${range().startDate}&endDate=${range().endDate}`);
        if (res.body.totalCount !== 1) missing.push(receiptNo);
      }
      check(`Round ${round}: all ${receipts.length} confirmed receipts survived the kill`, missing.length === 0, missing);
      if (round === ROUNDS) await verifyState(owner, round);
      await stopDevice(device.child);
      process.stdout.write(`\rRound ${round}/${ROUNDS}: ${confirmed} sales confirmed so far, ${fail} failures`);
    }
    startTimes.sort((a, b) => a - b);
    console.log(`\nRestart time: median ${startTimes[Math.floor(startTimes.length / 2)]}ms, max ${startTimes[startTimes.length - 1]}ms`);
  } catch (err) {
    fail++;
    console.error("\nCRASH", err);
  } finally {
    if (device && device.child) await stopDevice(device.child);
    // Exit only once the summary is written: a piped stdout can drop it otherwise.
    const summary = `\n${pass} checks passed, ${fail} failed · ${Math.round((Date.now() - started) / 1000)}s\n`;
    process.stdout.write(summary, () => process.exit(fail ? 1 : 0));
  }
})();
